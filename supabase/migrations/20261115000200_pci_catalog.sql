-- =============================================================================
-- RevisaYa PCI · 2 · Catálogo del sistema: categorías, tipos y operaciones de
-- mantenimiento con su periodicidad mínima.
--
-- Fuente verificada: Real Decreto 513/2017 (RIPCI), anexo II, tablas I, II y
-- III, texto consolidado del BOE (BOE-A-2017-6606, última modificación
-- 03/09/2025). Las operaciones de la tabla I (cada 3 y 6 meses) las puede
-- hacer el titular: vienen DESACTIVADAS por defecto y el taller las activa si
-- las presta. Las de la tabla II (cada año y cada 5 años) son de la empresa
-- mantenedora: vienen activadas. El taller puede ajustar cada periodicidad
-- (org_action_type_settings), nunca por debajo de lo que exija la normativa
-- vigente: es su responsabilidad técnica. El software no certifica nada.
-- =============================================================================

insert into public.equipment_categories (code, name, prefix, position, ripci_ref) values
  ('extinguisher',        'Extintores de incendio',                           'EXT', 1,  'RIPCI anexo I, sección 1.ª, 4; anexo II, tablas I y II'),
  ('bie',                 'Bocas de incendio equipadas (BIE)',                'BIE', 2,  'RIPCI anexo I, sección 1.ª, 5; anexo II, tablas I y II'),
  ('hydrant',             'Hidrantes',                                        'HID', 3,  'RIPCI anexo II, tablas I y II'),
  ('dry_riser',           'Columnas secas',                                   'CSE', 4,  'RIPCI anexo I, sección 1.ª, 6; anexo II, tablas I y II'),
  ('detection_alarm',     'Sistemas de detección y alarma de incendios',      'DET', 5,  'RIPCI anexo II, tablas I y II'),
  ('fixed_extinguishing', 'Sistemas fijos de extinción',                      'SFE', 6,  'RIPCI anexo II, tablas I y II'),
  ('water_supply',        'Sistemas de abastecimiento de agua contra incendios', 'ABA', 7, 'RIPCI anexo II, tablas I y II'),
  ('smoke_control',       'Sistemas para el control de humos y de calor',     'CHC', 8,  'RIPCI anexo II, tablas I y II'),
  ('luminescent_signage', 'Señalización luminiscente',                        'SEN', 9,  'RIPCI anexo II, tabla III'),
  ('other',               'Otros equipos',                                    'OTR', 10, null);

insert into public.equipment_types (organization_id, category_code, code, name) values
  (null, 'extinguisher', 'powder_abc', 'Extintor de polvo ABC'),
  (null, 'extinguisher', 'powder_bc', 'Extintor de polvo BC'),
  (null, 'extinguisher', 'co2', 'Extintor de CO₂'),
  (null, 'extinguisher', 'water', 'Extintor de agua'),
  (null, 'extinguisher', 'water_additive', 'Extintor de agua con aditivos'),
  (null, 'extinguisher', 'foam', 'Extintor de espuma'),
  (null, 'extinguisher', 'wet_chemical_f', 'Extintor para fuegos de clase F'),
  (null, 'extinguisher', 'powder_d', 'Extintor de polvo para metales (clase D)'),
  (null, 'extinguisher', 'clean_agent', 'Extintor de agente especial'),
  (null, 'bie', 'bie_25', 'BIE de 25 mm (manguera semirrígida)'),
  (null, 'bie', 'bie_45', 'BIE de 45 mm (manguera plana)'),
  (null, 'hydrant', 'hydrant_column', 'Hidrante de columna'),
  (null, 'hydrant', 'hydrant_underground', 'Hidrante enterrado'),
  (null, 'dry_riser', 'dry_riser', 'Columna seca'),
  (null, 'detection_alarm', 'control_panel', 'Central de detección y alarma'),
  (null, 'detection_alarm', 'point_detector', 'Detector automático'),
  (null, 'detection_alarm', 'manual_call_point', 'Pulsador de alarma'),
  (null, 'detection_alarm', 'sounder', 'Avisador acústico o luminoso'),
  (null, 'fixed_extinguishing', 'sprinklers', 'Rociadores automáticos de agua'),
  (null, 'fixed_extinguishing', 'water_spray', 'Agua pulverizada'),
  (null, 'fixed_extinguishing', 'water_mist', 'Agua nebulizada'),
  (null, 'fixed_extinguishing', 'foam', 'Espuma física'),
  (null, 'fixed_extinguishing', 'powder', 'Polvo'),
  (null, 'fixed_extinguishing', 'gaseous', 'Agentes extintores gaseosos'),
  (null, 'fixed_extinguishing', 'aerosol', 'Aerosoles condensados'),
  (null, 'water_supply', 'pump_set', 'Grupo de bombeo contra incendios'),
  (null, 'water_supply', 'water_reserve', 'Reserva de agua (depósito)'),
  (null, 'smoke_control', 'smoke_control', 'Sistema de control de humos y calor'),
  (null, 'luminescent_signage', 'signage', 'Señalización y balizamiento luminiscente'),
  (null, 'other', 'other', 'Otro equipo');

-- Operaciones. interval_months = periodicidad mínima de la tabla citada.
insert into public.maintenance_action_types
  (organization_id, category_code, code, name, kind, interval_months, performed_by, enabled_by_default, legal_reference, description, position) values
  -- Extintores
  (null, 'extinguisher', 'ext_quarterly', 'Verificación trimestral', 'inspection', 3, 'maintainer_or_owner', false,
   'RIPCI anexo II, tabla I (cada tres meses)',
   'Lugar asignado y sin daños aparentes; adecuado al riesgo; acceso no obstruido, visible o señalizado e instrucciones legibles en la parte delantera; indicador de presión en zona de operación; partes metálicas en buen estado; precintos o tapones indicadores de uso; no descargado. También se cumple con el «Programa de Mantenimiento Trimestral» de la UNE 23120.', 10),
  (null, 'extinguisher', 'ext_annual', 'Mantenimiento anual (UNE 23120)', 'periodic_maintenance', 12, 'maintainer', true,
   'RIPCI anexo II, tabla II (cada año)',
   'Operaciones del «Programa de Mantenimiento Anual» de la norma UNE 23120. En extintores móviles, además, buen estado del sistema de traslado.', 20),
  (null, 'extinguisher', 'ext_retimbrado', 'Retimbrado (prueba de nivel C)', 'retimbrado', 60, 'maintainer', true,
   'RIPCI anexo II, tabla II (cada cinco años); anexo III del Reglamento de Equipos a Presión (RD 809/2021)',
   'Prueba de nivel C. «A partir de la fecha de timbrado del extintor (y por tres veces) se procederá al retimbrado».', 30),
  (null, 'extinguisher', 'ext_recharge', 'Recarga', 'recharge', null, 'maintainer', true, null, 'Recarga tras uso o descarga.', 40),
  -- BIE
  (null, 'bie', 'bie_quarterly', 'Comprobación trimestral de BIE', 'inspection', 3, 'maintainer_or_owner', false,
   'RIPCI anexo II, tabla I (cada tres meses)',
   'Señalización; accesibilidad; presión por lectura del manómetro; componentes (lanza, válvula, manguera…) sin daños aparentes.', 10),
  (null, 'bie', 'bie_annual', 'Inspección y mantenimiento anual (UNE-EN 671-3)', 'periodic_maintenance', 12, 'maintainer', true,
   'RIPCI anexo II, tabla II (cada año)',
   'Operaciones anuales de la UNE-EN 671-3. Las mangueras se sustituyen al menos cada 20 años desde su puesta en servicio, salvo que el fabricante certifique una durabilidad mayor.', 20),
  (null, 'bie', 'bie_5y', 'Mantenimiento quinquenal de la manguera (UNE-EN 671-3)', 'periodic_maintenance', 60, 'maintainer', true,
   'RIPCI anexo II, tabla II (cada cinco años)', 'Operaciones quinquenales sobre la manguera según la UNE-EN 671-3.', 30),
  -- Hidrantes
  (null, 'hydrant', 'hyd_quarterly', 'Comprobación trimestral de hidrantes', 'inspection', 3, 'maintainer_or_owner', false,
   'RIPCI anexo II, tabla I (cada tres meses)', 'Accesibilidad y señalización; inspección visual de estanquidad; tapas de salidas, roscas y juntas de los racores.', 10),
  (null, 'hydrant', 'hyd_semiannual', 'Comprobación semestral de hidrantes', 'inspection', 6, 'maintainer_or_owner', false,
   'RIPCI anexo II, tabla I (cada seis meses)', 'Engrase de la tuerca de accionamiento o relleno de la cámara de aceite; abrir y cerrar comprobando válvula principal y drenaje.', 20),
  (null, 'hydrant', 'hyd_annual', 'Mantenimiento anual de hidrantes', 'periodic_maintenance', 12, 'maintainer', true,
   'RIPCI anexo II, tabla II (cada año)', 'Verificar la estanquidad de los tapones.', 30),
  (null, 'hydrant', 'hyd_5y', 'Mantenimiento quinquenal de hidrantes', 'periodic_maintenance', 60, 'maintainer', true,
   'RIPCI anexo II, tabla II (cada cinco años)', 'Cambio de las juntas de los racores.', 40),
  -- Columnas secas
  (null, 'dry_riser', 'dry_semiannual', 'Comprobación semestral de columna seca', 'inspection', 6, 'maintainer_or_owner', false,
   'RIPCI anexo II, tabla I (cada seis meses)', 'Accesibilidad de la entrada y tomas de piso; señalización; tapas y cierres; maniobra de llaves; conexiones siamesas cerradas; válvulas de seccionamiento abiertas; tapas de racores.', 10),
  (null, 'dry_riser', 'dry_5y', 'Prueba quinquenal de columna seca', 'periodic_maintenance', 60, 'maintainer', true,
   'RIPCI anexo II, tabla II (cada cinco años)', 'Prueba de la instalación en las condiciones de su recepción.', 20),
  -- Detección y alarma
  (null, 'detection_alarm', 'det_quarterly', 'Comprobación trimestral de detección y alarma', 'inspection', 3, 'maintainer_or_owner', false,
   'RIPCI anexo II, tabla I (cada tres meses)', 'Funcionamiento con cada fuente de suministro; indicaciones de la central; acumuladores; baterías y conmutación en fallo de red; pulsadores; avisadores luminosos y acústicos.', 10),
  (null, 'detection_alarm', 'det_annual', 'Mantenimiento anual de detección y alarma (UNE-EN 23007-14)', 'periodic_maintenance', 12, 'maintainer', true,
   'RIPCI anexo II, tabla II (cada año)', 'Maniobras programadas; versión de software de la central; prueba individual de detectores y de todos los pulsadores; operaciones de la UNE-EN 23007-14. Vida útil de los detectores: la del fabricante o, si no la fija, 10 años desde su puesta en servicio.', 20),
  -- Sistemas fijos de extinción
  (null, 'fixed_extinguishing', 'sfe_quarterly', 'Comprobación trimestral de sistema fijo de extinción', 'inspection', 3, 'maintainer_or_owner', false,
   'RIPCI anexo II, tabla I (cada tres meses)', 'Dispositivos de descarga; estado general; manómetros; circuitos de señalización; mandos manuales de paro y disparo; limpieza.', 10),
  (null, 'fixed_extinguishing', 'sfe_semiannual', 'Comprobación semestral de sistema fijo de extinción', 'inspection', 6, 'maintainer_or_owner', false,
   'RIPCI anexo II, tabla I (cada seis meses)', 'Tuberías, depósitos y latiguillos; válvulas abiertas en sistemas de agua; suministro eléctrico a grupos de bombeo.', 20),
  (null, 'fixed_extinguishing', 'sfe_annual', 'Mantenimiento anual de sistema fijo de extinción', 'periodic_maintenance', 12, 'maintainer', true,
   'RIPCI anexo II, tabla II (cada año)', 'Respuesta a las señales manuales y automáticas; suministro de agua; cantidad de agente; espumógeno; estanquidad de la sala (inundación total). Rociadores: «Programa anual» de la UNE-EN 12845.', 30),
  (null, 'fixed_extinguishing', 'sfe_5y', 'Mantenimiento quinquenal de sistema fijo de extinción', 'periodic_maintenance', 60, 'maintainer', true,
   'RIPCI anexo II, tabla II (cada cinco años)', 'Gaseosos y aerosoles: prueba de estanqueidad de la sala en condiciones de descarga. Espuma: coeficiente de expansión, drenaje y concentración (UNE-EN 1568).', 40),
  -- Abastecimiento de agua
  (null, 'water_supply', 'aba_quarterly', 'Comprobación trimestral del abastecimiento de agua', 'inspection', 3, 'maintainer_or_owner', false,
   'RIPCI anexo II, tabla I (cada tres meses)', 'Inspección de elementos, depósitos, válvulas, mandos, alarmas y motobombas; funcionamiento automático y manual; acumuladores y niveles; accesibilidad y ventilación de salas de bombas.', 10),
  (null, 'water_supply', 'aba_semiannual', 'Comprobación semestral del abastecimiento de agua', 'inspection', 6, 'maintainer_or_owner', false,
   'RIPCI anexo II, tabla I (cada seis meses)', 'Accionamiento y engrase de válvulas; prensaestopas; velocidad de los motores; alimentación eléctrica.', 20),
  (null, 'water_supply', 'aba_annual', 'Mantenimiento anual del abastecimiento de agua', 'periodic_maintenance', 12, 'maintainer', true,
   'RIPCI anexo II, tabla II (cada año)', 'Reserva de agua; filtros; baterías y electrolito; prueba en condiciones de recepción con curvas de abastecimiento.', 30),
  -- Control de humos y calor
  (null, 'smoke_control', 'chc_quarterly', 'Comprobación trimestral del control de humos', 'inspection', 3, 'maintainer_or_owner', false,
   'RIPCI anexo II, tabla I (cada tres meses)', 'Obstrucciones o cambios en la geometría del edificio; inspección visual general.', 10),
  (null, 'smoke_control', 'chc_semiannual', 'Comprobación semestral del control de humos', 'inspection', 6, 'maintainer_or_owner', false,
   'RIPCI anexo II, tabla I (cada seis meses)', 'Activación manual de los componentes; limpieza.', 20),
  (null, 'smoke_control', 'chc_annual', 'Mantenimiento anual del control de humos', 'periodic_maintenance', 12, 'maintainer', true,
   'RIPCI anexo II, tabla II (cada año)', 'Funcionamiento en activación y descanso y tiempo de respuesta; barreras; fuentes de alimentación; engrase; señales de alarma e interacción con la detección.', 30),
  -- Señalización luminiscente
  (null, 'luminescent_signage', 'sen_annual', 'Comprobación anual de señalización luminiscente', 'inspection', 12, 'maintainer_or_owner', true,
   'RIPCI anexo II, tabla III (cada año)', 'Existencia, ubicación, limpieza, legibilidad e iluminación en la oscuridad; elementos de sujeción. Fotoluminiscentes: sustitución a los 20 años desde su fabricación salvo medición favorable (UNE 23035).', 10),
  -- Operaciones no periódicas, para cualquier categoría
  (null, null, 'repair', 'Reparación', 'repair', null, 'maintainer', true, null, null, 80),
  (null, null, 'replacement', 'Sustitución', 'replacement', null, 'maintainer', true, null, 'Sustitución del equipo o de un componente.', 85),
  (null, null, 'decommission', 'Baja del equipo', 'decommission', null, 'maintainer', true, null, 'Retirada del servicio. El equipo deja de tener vencimientos.', 90),
  (null, null, 'other_action', 'Otra actuación', 'other', null, 'maintainer', true, null, null, 99);
