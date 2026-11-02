# Pruebas realizadas

Resultados de la última ejecución en el entorno de construcción (Linux, Python 3.13, Node 22, FFmpeg 6.1, PostgreSQL 16, Redis 7).

| Suite | Resultado | Qué demuestra |
|---|---|---|
| `backend` pytest sobre SQLite | **54/54** | Lógica completa con procesamiento real FFmpeg/Pillow. |
| `backend` pytest sobre **PostgreSQL + Redis** | **54/54** | Mismo comportamiento con la infraestructura de producción. |
| `scripts/integration_test.py` contra la pila en marcha (uvicorn + **workers arq separados** + PostgreSQL + Redis) | **36/36** | Cola distribuida, workers, progreso real, cancelación (abort), descargas, aislamiento. |
| Playwright (Chromium) escritorio + móvil | **10/10** | La interfaz funciona de punta a punta, sin errores de consola, sin desbordamiento horizontal en móvil. |
| `alembic upgrade head` en PostgreSQL vacío | OK | Esquema de producción reproducible. |
| `next build` + `tsc --noEmit` | OK | Frontend compila en modo producción con tipado estricto. |

## Cobertura por requisito

| Requisito | Prueba |
|---|---|
| Se procesan las imágenes subidas | `test_local_image_ops_create_new_asset_and_keep_original`, `test_lanczos_upscale`, E2E «editor de imagen» |
| Se procesan los vídeos (edición real) | `test_video_ops_real_ffmpeg` (corte + cámara lenta interpolada + color + reencuadre inteligente + subtítulos), `test_segment_edit_keeps_rest_of_video`, integración (estabilización, letterbox), E2E «editor de vídeo» |
| Audio | `test_audio_mix_and_ops` (mezcla con retardos, denoise, loudnorm, fundidos) |
| Montaje y exportación | `test_timeline_render_and_exports` (3 clips, transiciones xfade, efecto por clip, superposición, música con fundidos, subtítulos quemados; OTIO válido y SRT), E2E «montaje» |
| Sistema de trabajos | `test_fallback_to_next_provider_and_outputs_stored`, `test_non_retryable_error_does_not_fall_back`, `test_progress_cancel_retry_duplicate`, `test_concurrency_limit`, `test_history_filters` |
| Recuperación de trabajos fallidos | `test_stale_job_recovery` (worker caído → re-encolado → completado), reintento en integración |
| Extensión de vídeo y multi-shot | `test_video_extend_pipeline`, `test_multi_shot_sequence_with_continuity` |
| Estudio de películas | `test_film_full_pipeline` (guion → reescritura de escena → referencias → fotogramas con referencia de personaje → clips → montaje → render), `test_script_sanitisation_and_consistency_prompt` |
| Planificador de ediciones | `test_image_plan_*`, `test_video_plan_separates_ffmpeg_from_generative` |
| Se guardan los proyectos / el editor guarda cambios | `test_favorites_projects_and_delete`, concurrencia optimista (409) en películas y timelines, E2E «película» |
| Sesión | `test_register_login_session`, `test_login_logout_and_refresh_rotation`, `test_password_reset_flow` |
| Los usuarios no acceden a archivos ajenos | `test_users_cannot_access_each_others_data` + integración |
| Descargas | `test_upload_inspects_media` (incl. rangos HTTP 206), integración |
| Validación de archivos | `test_rejects_disguised_and_unknown_files`, `test_mask_upload_is_normalised` |
| Errores claros | `test_unconfigured_model_explains_missing_key`, `test_film_develop_requires_llm`, `test_param_validation` |
| Almacenamiento S3 | `test_s3_roundtrip`, `test_upload_and_download_redirect_with_s3` (emulador moto) |
| Adaptadores de proveedores | `test_provider_contracts.py`: Replicate (modelo oficial, versión fijada, subida de archivos, progreso desde logs, cancelación, error de autenticación), fal (cola, posición, resultado, error 422), BFL (base64, sondeo, progreso), Hugging Face (bytes, semillas), ComfyUI (workflow, historial, `/view`), ElevenLabs (TTS); y que cada ruta del catálogo tenga *mapper*. |

## Lo que NO se ha podido probar aquí

- **Generaciones reales con proveedores en la nube**: la red del entorno bloqueaba sus dominios (`huggingface.co`, `api.replicate.com`, `fal.run`, `api.bfl.ai`, `api.elevenlabs.io`, `api.pexels.com`…). Los adaptadores se verificaron contra los contratos HTTP documentados con `respx`, y el flujo completo de trabajos con dobles de prueba que solo existen en la suite de tests. **Los esquemas de entrada de algunos modelos pueden haber cambiado**: si un proveedor devuelve 422, ajusta el *mapper* correspondiente.
- **Diffusers y ComfyUI reales**: sin GPU ni acceso al Hub de modelos.
- **Imágenes Docker**: sin demonio Docker; `docker compose config` valida la composición, pero las imágenes no se construyeron.
- **Carga**: no hay pruebas de rendimiento con muchos usuarios simultáneos.

## Cómo ejecutar

```bash
cd backend && python -m pytest -q
TEST_DATABASE_URL=postgresql+asyncpg://user:pass@host/db TEST_REDIS_URL=redis://host:6379/1 python -m pytest -q
scripts/local_stack.sh start && python backend/scripts/integration_test.py
cd frontend && npx playwright test        # con la web en :3000 (WITH_WEB=1 scripts/local_stack.sh start)
```

Primera prueba recomendada con claves reales: añade `HF_TOKEN` (tiene créditos gratuitos), genera una imagen con FLUX.1-schnell, conviértela en vídeo con un modelo de fal/Replicate y móntala en el estudio.
