-- =============================================================================
-- AnunciaPro · 0004 · Datos de referencia: planes, categorías y atributos
-- Son datos necesarios para que la aplicación funcione (no datos de demo).
-- Los límites y precios son editables desde el panel de administración.
-- =============================================================================
insert into public.plans (code, name, price, currency, monthly_listing_limit, monthly_bulk_limit, features, display_order)
values
  ('free', 'Free', 0, 'EUR', 10, 0,
   '{"max_products": 50, "max_templates": 1, "max_bulk_rows": 0, "max_images_per_product": 3, "export_formats": ["txt", "csv"]}', 1),
  ('starter', 'Starter', 5.99, 'EUR', 100, 0,
   '{"max_products": 500, "max_templates": 10, "max_bulk_rows": 0, "max_images_per_product": 6, "export_formats": ["txt", "csv", "json"]}', 2),
  ('pro', 'Pro', 12.99, 'EUR', 500, 500,
   '{"max_products": 5000, "max_templates": 50, "max_bulk_rows": 500, "max_images_per_product": 10, "export_formats": ["txt", "csv", "json", "shopify_csv"]}', 3),
  ('business', 'Business', 29.99, 'EUR', 2000, 2000,
   '{"max_products": 50000, "max_templates": 200, "max_bulk_rows": 2000, "max_images_per_product": 12, "export_formats": ["txt", "csv", "json", "shopify_csv"], "team_ready": true}', 4)
on conflict (code) do nothing;

-- Helpers temporales para sembrar categorías de forma legible.
create function pg_temp.cat(p_slug text, p_name text, p_parent text default null, p_order integer default 0)
returns void language plpgsql as $$
begin
  insert into public.categories (name, slug, parent_id, display_order)
  values (p_name, p_slug,
          (select id from public.categories where slug = p_parent and workspace_id is null), p_order)
  on conflict do nothing;
end $$;

create function pg_temp.attr(
  p_cat text, p_key text, p_name text, p_type text default 'text', p_required boolean default false,
  p_options jsonb default '[]', p_unit text default null, p_title boolean default false, p_order integer default 0
) returns void language plpgsql as $$
begin
  insert into public.category_attributes
    (category_id, attribute_key, attribute_name, attribute_type, is_required, options, unit, show_in_title, display_order)
  values ((select id from public.categories where slug = p_cat and workspace_id is null),
          p_key, p_name, p_type, p_required, p_options, p_unit, p_title, p_order)
  on conflict do nothing;
end $$;

do $$
begin
  -- Categorías principales
  perform pg_temp.cat('moviles', 'Móviles y telefonía', null, 1);
  perform pg_temp.cat('electronica', 'Electrónica', null, 2);
  perform pg_temp.cat('ordenadores', 'Ordenadores', null, 3);
  perform pg_temp.cat('videojuegos', 'Videojuegos y consolas', null, 4);
  perform pg_temp.cat('ropa', 'Ropa', null, 5);
  perform pg_temp.cat('calzado', 'Calzado', null, 6);
  perform pg_temp.cat('accesorios', 'Accesorios y complementos', null, 7);
  perform pg_temp.cat('muebles', 'Muebles', null, 8);
  perform pg_temp.cat('decoracion', 'Decoración', null, 9);
  perform pg_temp.cat('electrodomesticos', 'Electrodomésticos', null, 10);
  perform pg_temp.cat('vehiculos', 'Vehículos', null, 11);
  perform pg_temp.cat('motocicletas', 'Motocicletas', null, 12);
  perform pg_temp.cat('bicicletas', 'Bicicletas', null, 13);
  perform pg_temp.cat('inmuebles', 'Inmuebles', null, 14);
  perform pg_temp.cat('herramientas', 'Herramientas', null, 15);
  perform pg_temp.cat('maquinaria', 'Maquinaria', null, 16);
  perform pg_temp.cat('belleza', 'Belleza y cuidado personal', null, 17);
  perform pg_temp.cat('deportes', 'Deporte y ocio', null, 18);
  perform pg_temp.cat('bebes', 'Bebés y niños', null, 19);
  perform pg_temp.cat('libros-musica', 'Libros, música y cine', null, 20);
  perform pg_temp.cat('coleccionismo', 'Coleccionismo', null, 21);
  perform pg_temp.cat('otros', 'Otros', null, 99);

  -- Subcategorías
  perform pg_temp.cat('smartphones', 'Smartphones', 'moviles', 1);
  perform pg_temp.cat('accesorios-movil', 'Accesorios para móvil', 'moviles', 2);
  perform pg_temp.cat('televisores', 'Televisores', 'electronica', 1);
  perform pg_temp.cat('audio', 'Audio y auriculares', 'electronica', 2);
  perform pg_temp.cat('camaras', 'Cámaras y fotografía', 'electronica', 3);
  perform pg_temp.cat('tablets', 'Tablets y ebooks', 'electronica', 4);
  perform pg_temp.cat('smartwatches', 'Relojes inteligentes', 'electronica', 5);
  perform pg_temp.cat('portatiles', 'Portátiles', 'ordenadores', 1);
  perform pg_temp.cat('sobremesa', 'Ordenadores de sobremesa', 'ordenadores', 2);
  perform pg_temp.cat('monitores', 'Monitores', 'ordenadores', 3);
  perform pg_temp.cat('componentes', 'Componentes y periféricos', 'ordenadores', 4);
  perform pg_temp.cat('consolas', 'Consolas', 'videojuegos', 1);
  perform pg_temp.cat('juegos', 'Juegos', 'videojuegos', 2);
  perform pg_temp.cat('ropa-mujer', 'Mujer', 'ropa', 1);
  perform pg_temp.cat('ropa-hombre', 'Hombre', 'ropa', 2);
  perform pg_temp.cat('ropa-infantil', 'Infantil', 'ropa', 3);
  perform pg_temp.cat('bolsos', 'Bolsos y mochilas', 'accesorios', 1);
  perform pg_temp.cat('relojes', 'Relojes', 'accesorios', 2);
  perform pg_temp.cat('joyeria', 'Joyería y bisutería', 'accesorios', 3);
  perform pg_temp.cat('sofas', 'Sofás y sillones', 'muebles', 1);
  perform pg_temp.cat('mesas', 'Mesas', 'muebles', 2);
  perform pg_temp.cat('sillas', 'Sillas', 'muebles', 3);
  perform pg_temp.cat('camas', 'Camas y colchones', 'muebles', 4);
  perform pg_temp.cat('armarios', 'Armarios y almacenaje', 'muebles', 5);
  perform pg_temp.cat('coches', 'Coches', 'vehiculos', 1);
  perform pg_temp.cat('furgonetas', 'Furgonetas', 'vehiculos', 2);
  perform pg_temp.cat('recambios', 'Recambios y accesorios', 'vehiculos', 3);
  perform pg_temp.cat('pisos', 'Pisos y apartamentos', 'inmuebles', 1);
  perform pg_temp.cat('casas', 'Casas y chalets', 'inmuebles', 2);
  perform pg_temp.cat('locales', 'Locales y oficinas', 'inmuebles', 3);
  perform pg_temp.cat('garajes', 'Garajes y trasteros', 'inmuebles', 4);

  -- Móviles
  perform pg_temp.attr('moviles', 'color', 'Color', 'text', false, '[]', null, true, 3);
  perform pg_temp.attr('moviles', 'accesorios', 'Accesorios incluidos', 'text', false, '[]', null, false, 6);
  perform pg_temp.attr('smartphones', 'almacenamiento', 'Almacenamiento', 'select', true,
    '["16 GB","32 GB","64 GB","128 GB","256 GB","512 GB","1 TB"]', null, true, 1);
  perform pg_temp.attr('smartphones', 'ram', 'Memoria RAM', 'select', false,
    '["2 GB","3 GB","4 GB","6 GB","8 GB","12 GB","16 GB"]', null, false, 2);
  perform pg_temp.attr('smartphones', 'estado_bateria', 'Estado de la batería', 'number', false, '[]', '%', false, 4);
  perform pg_temp.attr('smartphones', 'libre', 'Libre de operador', 'boolean', false, '[]', null, false, 5);

  -- Electrónica
  perform pg_temp.attr('electronica', 'color', 'Color', 'text', false, '[]', null, false, 5);
  perform pg_temp.attr('electronica', 'accesorios', 'Accesorios incluidos', 'text', false, '[]', null, false, 6);
  perform pg_temp.attr('televisores', 'tamano_pantalla', 'Tamaño de pantalla', 'number', true, '[]', 'pulgadas', true, 1);
  perform pg_temp.attr('televisores', 'resolucion', 'Resolución', 'select', false, '["HD","Full HD","4K","8K"]', null, true, 2);
  perform pg_temp.attr('televisores', 'smart_tv', 'Smart TV', 'boolean', false, '[]', null, false, 3);
  perform pg_temp.attr('audio', 'tipo', 'Tipo', 'select', false,
    '["Auriculares","Altavoz","Barra de sonido","Equipo de música","Tocadiscos","Otro"]', null, false, 1);
  perform pg_temp.attr('audio', 'conectividad', 'Conectividad', 'select', false, '["Bluetooth","Cable","Wi-Fi","Mixta"]', null, false, 2);
  perform pg_temp.attr('camaras', 'tipo', 'Tipo de cámara', 'select', false,
    '["Réflex","Sin espejo","Compacta","Acción","Instantánea","Objetivo","Otro"]', null, false, 1);
  perform pg_temp.attr('camaras', 'megapixeles', 'Megapíxeles', 'number', false, '[]', 'MP', false, 2);
  perform pg_temp.attr('tablets', 'tamano_pantalla', 'Tamaño de pantalla', 'number', false, '[]', 'pulgadas', true, 1);
  perform pg_temp.attr('tablets', 'almacenamiento', 'Almacenamiento', 'text', false, '[]', null, true, 2);

  -- Ordenadores
  perform pg_temp.attr('ordenadores', 'procesador', 'Procesador', 'text', false, '[]', null, true, 1);
  perform pg_temp.attr('ordenadores', 'ram', 'Memoria RAM', 'text', false, '[]', null, true, 2);
  perform pg_temp.attr('ordenadores', 'almacenamiento', 'Almacenamiento', 'text', false, '[]', null, true, 3);
  perform pg_temp.attr('ordenadores', 'tarjeta_grafica', 'Tarjeta gráfica', 'text', false, '[]', null, false, 4);
  perform pg_temp.attr('ordenadores', 'sistema_operativo', 'Sistema operativo', 'text', false, '[]', null, false, 5);
  perform pg_temp.attr('portatiles', 'tamano_pantalla', 'Tamaño de pantalla', 'number', false, '[]', 'pulgadas', false, 6);
  perform pg_temp.attr('monitores', 'tamano_pantalla', 'Tamaño de pantalla', 'number', true, '[]', 'pulgadas', true, 6);
  perform pg_temp.attr('monitores', 'resolucion', 'Resolución', 'text', false, '[]', null, false, 7);

  -- Videojuegos
  perform pg_temp.attr('videojuegos', 'plataforma', 'Plataforma', 'select', true,
    '["PlayStation 5","PlayStation 4","Xbox Series X|S","Xbox One","Nintendo Switch","PC","Retro","Otra"]', null, true, 1);
  perform pg_temp.attr('videojuegos', 'incluye', 'Qué incluye', 'text', false, '[]', null, false, 3);
  perform pg_temp.attr('juegos', 'formato', 'Formato', 'select', false, '["Físico","Digital"]', null, false, 2);
  perform pg_temp.attr('consolas', 'almacenamiento', 'Almacenamiento', 'text', false, '[]', null, true, 2);

  -- Ropa y calzado
  perform pg_temp.attr('ropa', 'talla', 'Talla', 'text', true, '[]', null, true, 1);
  perform pg_temp.attr('ropa', 'color', 'Color', 'text', false, '[]', null, true, 2);
  perform pg_temp.attr('ropa', 'material', 'Material', 'text', false, '[]', null, false, 3);
  perform pg_temp.attr('ropa', 'genero', 'Género', 'select', false, '["Mujer","Hombre","Unisex","Niña","Niño"]', null, false, 4);
  perform pg_temp.attr('ropa', 'temporada', 'Temporada', 'select', false,
    '["Primavera-Verano","Otoño-Invierno","Todo el año"]', null, false, 5);
  perform pg_temp.attr('calzado', 'talla', 'Talla (EU)', 'number', true, '[]', null, true, 1);
  perform pg_temp.attr('calzado', 'color', 'Color', 'text', false, '[]', null, true, 2);
  perform pg_temp.attr('calzado', 'material', 'Material', 'text', false, '[]', null, false, 3);
  perform pg_temp.attr('calzado', 'genero', 'Género', 'select', false, '["Mujer","Hombre","Unisex","Infantil"]', null, false, 4);
  perform pg_temp.attr('accesorios', 'material', 'Material', 'text', false, '[]', null, false, 1);
  perform pg_temp.attr('accesorios', 'color', 'Color', 'text', false, '[]', null, true, 2);

  -- Muebles y decoración
  perform pg_temp.attr('muebles', 'material', 'Material', 'text', false, '[]', null, true, 3);
  perform pg_temp.attr('muebles', 'color', 'Color', 'text', false, '[]', null, true, 4);
  perform pg_temp.attr('muebles', 'dimensiones', 'Dimensiones', 'text', false, '[]', null, false, 5);
  perform pg_temp.attr('sofas', 'tipo', 'Tipo', 'select', false,
    '["Fijo","Sofá cama","Chaise longue","Rinconera","Relax","Sillón","Otro"]', null, true, 1);
  perform pg_temp.attr('sofas', 'plazas', 'Número de plazas', 'number', true, '[]', 'plazas', true, 2);
  perform pg_temp.attr('camas', 'medidas_colchon', 'Medidas', 'text', false, '[]', null, true, 1);
  perform pg_temp.attr('decoracion', 'material', 'Material', 'text', false, '[]', null, false, 1);
  perform pg_temp.attr('decoracion', 'color', 'Color', 'text', false, '[]', null, false, 2);
  perform pg_temp.attr('decoracion', 'dimensiones', 'Dimensiones', 'text', false, '[]', null, false, 3);
  perform pg_temp.attr('decoracion', 'estilo', 'Estilo', 'text', false, '[]', null, false, 4);
  perform pg_temp.attr('electrodomesticos', 'tipo', 'Tipo', 'text', false, '[]', null, false, 1);
  perform pg_temp.attr('electrodomesticos', 'eficiencia_energetica', 'Eficiencia energética', 'select', false,
    '["A","B","C","D","E","F","G"]', null, false, 2);
  perform pg_temp.attr('electrodomesticos', 'capacidad', 'Capacidad', 'text', false, '[]', null, false, 3);
  perform pg_temp.attr('electrodomesticos', 'dimensiones', 'Dimensiones', 'text', false, '[]', null, false, 4);

  -- Vehículos
  perform pg_temp.attr('vehiculos', 'anio', 'Año', 'number', true, '[]', null, true, 1);
  perform pg_temp.attr('vehiculos', 'kilometros', 'Kilómetros', 'number', true, '[]', 'km', true, 2);
  perform pg_temp.attr('vehiculos', 'combustible', 'Combustible', 'select', true,
    '["Gasolina","Diésel","Híbrido","Híbrido enchufable","Eléctrico","GLP","GNC"]', null, true, 3);
  perform pg_temp.attr('vehiculos', 'transmision', 'Transmisión', 'select', false, '["Manual","Automática"]', null, false, 4);
  perform pg_temp.attr('vehiculos', 'potencia', 'Potencia', 'number', false, '[]', 'CV', false, 5);
  perform pg_temp.attr('vehiculos', 'puertas', 'Puertas', 'number', false, '[]', null, false, 6);
  perform pg_temp.attr('vehiculos', 'color', 'Color', 'text', false, '[]', null, false, 7);
  perform pg_temp.attr('vehiculos', 'itv', 'ITV vigente hasta', 'text', false, '[]', null, false, 8);

  -- Motocicletas
  perform pg_temp.attr('motocicletas', 'anio', 'Año', 'number', true, '[]', null, true, 1);
  perform pg_temp.attr('motocicletas', 'kilometros', 'Kilómetros', 'number', true, '[]', 'km', true, 2);
  perform pg_temp.attr('motocicletas', 'cilindrada', 'Cilindrada', 'number', false, '[]', 'cc', true, 3);
  perform pg_temp.attr('motocicletas', 'potencia', 'Potencia', 'number', false, '[]', 'CV', false, 4);
  perform pg_temp.attr('motocicletas', 'tipo_carnet', 'Carnet necesario', 'select', false, '["AM","A1","A2","A","B"]', null, false, 5);
  perform pg_temp.attr('motocicletas', 'color', 'Color', 'text', false, '[]', null, false, 6);

  -- Bicicletas
  perform pg_temp.attr('bicicletas', 'tipo', 'Tipo', 'select', false,
    '["Montaña","Carretera","Gravel","Urbana","Plegable","BMX","Infantil","Otro"]', null, true, 1);
  perform pg_temp.attr('bicicletas', 'talla_cuadro', 'Talla del cuadro', 'text', false, '[]', null, true, 2);
  perform pg_temp.attr('bicicletas', 'tamano_rueda', 'Tamaño de rueda', 'text', false, '[]', null, false, 3);
  perform pg_temp.attr('bicicletas', 'material_cuadro', 'Material del cuadro', 'text', false, '[]', null, false, 4);
  perform pg_temp.attr('bicicletas', 'marchas', 'Número de marchas', 'number', false, '[]', null, false, 5);
  perform pg_temp.attr('bicicletas', 'electrica', 'Eléctrica', 'boolean', false, '[]', null, false, 6);

  -- Inmuebles
  perform pg_temp.attr('inmuebles', 'operacion', 'Operación', 'select', true, '["Venta","Alquiler","Alquiler vacacional"]', null, true, 1);
  perform pg_temp.attr('inmuebles', 'superficie', 'Superficie', 'number', true, '[]', 'm²', true, 2);
  perform pg_temp.attr('inmuebles', 'habitaciones', 'Habitaciones', 'number', false, '[]', 'hab.', true, 3);
  perform pg_temp.attr('inmuebles', 'banos', 'Baños', 'number', false, '[]', null, false, 4);
  perform pg_temp.attr('inmuebles', 'planta', 'Planta', 'text', false, '[]', null, false, 5);
  perform pg_temp.attr('inmuebles', 'ascensor', 'Ascensor', 'boolean', false, '[]', null, false, 6);
  perform pg_temp.attr('inmuebles', 'certificado_energetico', 'Certificado energético', 'select', false,
    '["A","B","C","D","E","F","G","En trámite","Exento"]', null, false, 7);

  -- Herramientas y maquinaria
  perform pg_temp.attr('herramientas', 'tipo', 'Tipo de herramienta', 'text', false, '[]', null, false, 1);
  perform pg_temp.attr('herramientas', 'alimentacion', 'Alimentación', 'select', false,
    '["Manual","Eléctrica con cable","Batería","Neumática","Gasolina"]', null, false, 2);
  perform pg_temp.attr('herramientas', 'potencia', 'Potencia', 'number', false, '[]', 'W', false, 3);
  perform pg_temp.attr('herramientas', 'accesorios', 'Accesorios incluidos', 'text', false, '[]', null, false, 4);
  perform pg_temp.attr('maquinaria', 'tipo', 'Tipo de máquina', 'text', false, '[]', null, false, 1);
  perform pg_temp.attr('maquinaria', 'anio', 'Año', 'number', false, '[]', null, true, 2);
  perform pg_temp.attr('maquinaria', 'horas_uso', 'Horas de uso', 'number', false, '[]', 'h', false, 3);
  perform pg_temp.attr('maquinaria', 'potencia', 'Potencia', 'text', false, '[]', null, false, 4);

  -- Belleza, deporte, bebés, libros
  perform pg_temp.attr('belleza', 'tipo', 'Tipo de producto', 'text', false, '[]', null, false, 1);
  perform pg_temp.attr('belleza', 'contenido', 'Contenido', 'text', false, '[]', null, true, 2);
  perform pg_temp.attr('belleza', 'precintado', 'Precintado', 'boolean', false, '[]', null, false, 3);
  perform pg_temp.attr('belleza', 'caducidad', 'Fecha de caducidad', 'text', false, '[]', null, false, 4);
  perform pg_temp.attr('deportes', 'deporte', 'Deporte o actividad', 'text', false, '[]', null, false, 1);
  perform pg_temp.attr('deportes', 'talla', 'Talla o medida', 'text', false, '[]', null, true, 2);
  perform pg_temp.attr('deportes', 'material', 'Material', 'text', false, '[]', null, false, 3);
  perform pg_temp.attr('bebes', 'edad_recomendada', 'Edad recomendada', 'text', false, '[]', null, false, 1);
  perform pg_temp.attr('bebes', 'color', 'Color', 'text', false, '[]', null, false, 2);
  perform pg_temp.attr('libros-musica', 'autor', 'Autor o artista', 'text', false, '[]', null, true, 1);
  perform pg_temp.attr('libros-musica', 'formato', 'Formato', 'text', false, '[]', null, false, 2);
  perform pg_temp.attr('libros-musica', 'idioma', 'Idioma', 'text', false, '[]', null, false, 3);
  perform pg_temp.attr('coleccionismo', 'epoca', 'Época o año', 'text', false, '[]', null, false, 1);
  perform pg_temp.attr('coleccionismo', 'material', 'Material', 'text', false, '[]', null, false, 2);
end $$;
