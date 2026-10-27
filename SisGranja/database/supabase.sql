-- ==============================================================================
-- SISGRANJA - SISTEMA DE GESTIÓN PARA GRANJA DE CUYES
-- Esquema de Base de Datos para Supabase (PostgreSQL 14+)
-- ==============================================================================

-- 1. Habilitar extensión para UUIDs si no está habilitada
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Función para actualización automática de campos 'updated_at'
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 3. TABLA: pozas (Infraestructura y Alojamiento)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pozas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo VARCHAR(20) UNIQUE NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('Maternidad', 'Recría', 'Reproducción', 'Cuarentena', 'Engorde', 'Destete')),
    capacidad_maxima INTEGER NOT NULL DEFAULT 10 CHECK (capacidad_maxima > 0),
    ubicacion_galpon VARCHAR(50) DEFAULT 'Galpón 1',
    estado VARCHAR(30) NOT NULL DEFAULT 'Activa' CHECK (estado IN ('Activa', 'En Mantenimiento', 'Desinfectada', 'Inactiva')),
    observaciones TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Trigger para updated_at en pozas
DROP TRIGGER IF EXISTS trigger_pozas_updated_at ON public.pozas;
CREATE TRIGGER trigger_pozas_updated_at
    BEFORE UPDATE ON public.pozas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 4. TABLA: cuyes (Inventario de Animales)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.cuyes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo VARCHAR(30) UNIQUE NOT NULL,
    nombre VARCHAR(100),
    raza VARCHAR(50) NOT NULL CHECK (raza IN ('Perú', 'Andina', 'Inti', 'Criollo', 'California', 'Chota', 'Kuri', 'Otra')),
    genero VARCHAR(10) NOT NULL CHECK (genero IN ('Macho', 'Hembra')),
    etapa VARCHAR(30) NOT NULL CHECK (etapa IN ('Cría', 'Recría', 'Reproductor', 'Engorde', 'Descarte')),
    peso_actual_g NUMERIC(7,2) NOT NULL CHECK (peso_actual_g >= 0),
    fecha_nacimiento DATE NOT NULL,
    poza_id UUID REFERENCES public.pozas(id) ON DELETE SET NULL,
    padre_id UUID REFERENCES public.cuyes(id) ON DELETE SET NULL,
    madre_id UUID REFERENCES public.cuyes(id) ON DELETE SET NULL,
    estado_salud VARCHAR(30) NOT NULL DEFAULT 'Sano' CHECK (estado_salud IN ('Sano', 'En Observación', 'Enfermo', 'Cuarentena', 'Fallecido')),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    observaciones TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Trigger para updated_at en cuyes
DROP TRIGGER IF EXISTS trigger_cuyes_updated_at ON public.cuyes;
CREATE TRIGGER trigger_cuyes_updated_at
    BEFORE UPDATE ON public.cuyes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 5. TABLA: empadres (Ciclo Reproductivo / Cruces)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.empadres (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo VARCHAR(30) UNIQUE NOT NULL,
    macho_id UUID REFERENCES public.cuyes(id) ON DELETE RESTRICT,
    poza_id UUID REFERENCES public.pozas(id) ON DELETE SET NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE,
    fecha_estimada_parto DATE,
    estado VARCHAR(30) NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Gestación', 'Finalizado', 'Cancelado')),
    observaciones TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Trigger para updated_at en empadres
DROP TRIGGER IF EXISTS trigger_empadres_updated_at ON public.empadres;
CREATE TRIGGER trigger_empadres_updated_at
    BEFORE UPDATE ON public.empadres
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 6. TABLA: partos_camadas (Nacimientos, Camadas y Mortalidad)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.partos_camadas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo VARCHAR(30) UNIQUE NOT NULL,
    empadre_id UUID REFERENCES public.empadres(id) ON DELETE SET NULL,
    madre_id UUID REFERENCES public.cuyes(id) ON DELETE RESTRICT,
    fecha_parto DATE NOT NULL,
    crias_vivas INTEGER NOT NULL DEFAULT 0 CHECK (crias_vivas >= 0),
    crias_muertas INTEGER NOT NULL DEFAULT 0 CHECK (crias_muertas >= 0),
    peso_promedio_nacimiento_g NUMERIC(6,2),
    fecha_destete_programada DATE,
    estado_destete VARCHAR(30) NOT NULL DEFAULT 'Pendiente' CHECK (estado_destete IN ('Pendiente', 'En Proceso', 'Completado')),
    observaciones TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Trigger para updated_at en partos_camadas
DROP TRIGGER IF EXISTS trigger_partos_camadas_updated_at ON public.partos_camadas;
CREATE TRIGGER trigger_partos_camadas_updated_at
    BEFORE UPDATE ON public.partos_camadas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 7. TABLA: registros_medicos (Sanidad, Tratamientos y Vacunación)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.registros_medicos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cuy_id UUID REFERENCES public.cuyes(id) ON DELETE CASCADE,
    fecha_diagnostico DATE NOT NULL DEFAULT CURRENT_DATE,
    tipo_evento VARCHAR(40) NOT NULL CHECK (tipo_evento IN ('Preventivo', 'Tratamiento', 'Vacunación', 'Desparasitación', 'Cuarentena', 'Otro')),
    diagnostico VARCHAR(200) NOT NULL,
    medicamento VARCHAR(150),
    dosis VARCHAR(100),
    veterinario_responsable VARCHAR(120),
    fecha_seguimiento DATE,
    estado VARCHAR(30) NOT NULL DEFAULT 'En Tratamiento' CHECK (estado IN ('En Tratamiento', 'Recuperado', 'Crítico', 'Cerrado')),
    costo_tratamiento NUMERIC(8,2) DEFAULT 0.00,
    observaciones TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Trigger para updated_at en registros_medicos
DROP TRIGGER IF EXISTS trigger_registros_medicos_updated_at ON public.registros_medicos;
CREATE TRIGGER trigger_registros_medicos_updated_at
    BEFORE UPDATE ON public.registros_medicos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 8. ÍNDICES DE RENDIMIENTO (Performance Tuning)
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_cuyes_codigo ON public.cuyes(codigo);
CREATE INDEX IF NOT EXISTS idx_cuyes_etapa ON public.cuyes(etapa);
CREATE INDEX IF NOT EXISTS idx_cuyes_genero ON public.cuyes(genero);
CREATE INDEX IF NOT EXISTS idx_cuyes_salud ON public.cuyes(estado_salud);
CREATE INDEX IF NOT EXISTS idx_cuyes_poza ON public.cuyes(poza_id);
CREATE INDEX IF NOT EXISTS idx_cuyes_activo ON public.cuyes(activo);
CREATE INDEX IF NOT EXISTS idx_empadres_estado ON public.empadres(estado);
CREATE INDEX IF NOT EXISTS idx_partos_fecha ON public.partos_camadas(fecha_parto);
CREATE INDEX IF NOT EXISTS idx_partos_madre ON public.partos_camadas(madre_id);
CREATE INDEX IF NOT EXISTS idx_registros_medicos_cuy ON public.registros_medicos(cuy_id);
CREATE INDEX IF NOT EXISTS idx_registros_medicos_estado ON public.registros_medicos(estado);

-- ==============================================================================
-- 9. POLÍTICAS DE SEGURIDAD ROW LEVEL SECURITY (RLS)
-- NOTA: Se habilita RLS y se configuran políticas permisivas para desarrollo/evaluación.
-- En entornos de producción con autenticación, vincular con auth.uid().
-- ==============================================================================
ALTER TABLE public.pozas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuyes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empadres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partos_camadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registros_medicos ENABLE ROW LEVEL SECURITY;

-- Políticas para permitir SELECT, INSERT, UPDATE, DELETE a usuarios anónimos y autenticados
CREATE POLICY "Permitir acceso completo a pozas" ON public.pozas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir acceso completo a cuyes" ON public.cuyes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir acceso completo a empadres" ON public.empadres FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir acceso completo a partos_camadas" ON public.partos_camadas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir acceso completo a registros_medicos" ON public.registros_medicos FOR ALL USING (true) WITH CHECK (true);

-- ==============================================================================
-- 10. DATOS SEMILLA (SEED DATA) DE PRUEBA
-- ==============================================================================

-- Pozas iniciales
INSERT INTO public.pozas (id, codigo, nombre, tipo, capacidad_maxima, ubicacion_galpon, estado) VALUES
('11111111-1111-1111-1111-111111111101', 'PZ-MAT-01', 'Poza de Maternidad Norte', 'Maternidad', 8, 'Galpón 1', 'Activa'),
('11111111-1111-1111-1111-111111111102', 'PZ-REP-01', 'Poza Reproductoras A', 'Reproducción', 10, 'Galpón 1', 'Activa'),
('11111111-1111-1111-1111-111111111103', 'PZ-REC-01', 'Poza de Recría Hembras', 'Recría', 15, 'Galpón 2', 'Activa'),
('11111111-1111-1111-1111-111111111104', 'PZ-CUA-01', 'Poza de Cuarentena y Aislamiento', 'Cuarentena', 6, 'Galpón Sanitario', 'Activa')
ON CONFLICT (codigo) DO NOTHING;

-- Cuyes iniciales (Reproductores base)
INSERT INTO public.cuyes (id, codigo, nombre, raza, genero, etapa, peso_actual_g, fecha_nacimiento, poza_id, estado_salud, activo) VALUES
('22222222-2222-2222-2222-222222222201', 'CUY-2024-001', 'Zeus (Padrillo Alpha)', 'Perú', 'Macho', 'Reproductor', 1450.00, '2023-04-10', '11111111-1111-1111-1111-111111111102', 'Sano', true),
('22222222-2222-2222-2222-222222222202', 'CUY-2024-002', 'Luna', 'Andina', 'Hembra', 'Reproductor', 1120.00, '2023-05-15', '11111111-1111-1111-1111-111111111102', 'Sano', true),
('22222222-2222-2222-2222-222222222203', 'CUY-2024-003', 'Canela', 'Perú', 'Hembra', 'Reproductor', 1180.00, '2023-06-01', '11111111-1111-1111-1111-111111111101', 'Sano', true),
('22222222-2222-2222-2222-222222222204', 'CUY-2024-004', 'Thor (Padrillo Inti)', 'Inti', 'Macho', 'Reproductor', 1390.00, '2023-03-20', '11111111-1111-1111-1111-111111111102', 'Sano', true),
('22222222-2222-2222-2222-222222222205', 'CUY-2024-005', 'Manchitas', 'Criollo', 'Hembra', 'Recría', 680.00, '2024-01-12', '11111111-1111-1111-1111-111111111103', 'En Observación', true),
('22222222-2222-2222-2222-222222222206', 'CUY-2024-006', 'Copito', 'Andina', 'Macho', 'Cría', 220.00, '2024-03-01', '11111111-1111-1111-1111-111111111101', 'Sano', true)
ON CONFLICT (codigo) DO NOTHING;

-- Empadre inicial
INSERT INTO public.empadres (id, codigo, macho_id, poza_id, fecha_inicio, fecha_fin, fecha_estimada_parto, estado, observaciones) VALUES
('33333333-3333-3333-3333-333333333301', 'EMP-2024-001', '22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111102', '2023-12-01', '2024-01-15', '2024-02-10', 'Finalizado', 'Excelente celo y apareamiento sin incidentes.')
ON CONFLICT (codigo) DO NOTHING;

-- Camada de parto inicial
INSERT INTO public.partos_camadas (id, codigo, empadre_id, madre_id, fecha_parto, crias_vivas, crias_muertas, peso_promedio_nacimiento_g, fecha_destete_programada, estado_destete, observaciones) VALUES
('44444444-4444-4444-4444-444444444401', 'CAM-2024-001', '33333333-3333-3333-3333-333333333301', '22222222-2222-2222-2222-222222222203', '2024-02-11', 4, 0, 135.50, '2024-03-04', 'Completado', 'Parto natural asistido exitoso, crías muy activas.')
ON CONFLICT (codigo) DO NOTHING;

-- Registro médico inicial
INSERT INTO public.registros_medicos (id, cuy_id, fecha_diagnostico, tipo_evento, diagnostico, medicamento, dosis, veterinario_responsable, fecha_seguimiento, estado, costo_tratamiento, observaciones) VALUES
('55555555-5555-5555-5555-555555555501', '22222222-2222-2222-2222-222222222205', '2024-03-10', 'Tratamiento', 'Micosis dérmica leve en pabellón auricular', 'Ketoconazol pomada al 2%', '1 aplicación diaria por 7 días', 'Dr. Carlos Mendoza', '2024-03-18', 'En Tratamiento', 15.00, 'Aislada temporalmente para evitar contagio en la poza.')
ON CONFLICT DO NOTHING;

-- ==============================================================================
-- SINCRONIZACIÓN DE SisGranja_v2.5.html: estado completo de la granja en una fila
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.sisgranja_estado (
  id text PRIMARY KEY,
  datos jsonb NOT NULL,
  actualizado timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sisgranja_estado ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir acceso completo a sisgranja_estado" ON public.sisgranja_estado FOR ALL USING (true) WITH CHECK (true);
