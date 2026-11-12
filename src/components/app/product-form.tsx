"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, Select, Textarea, fieldAria } from "@/components/ui/form";
import { Card, CardHeader } from "@/components/ui/primitives";
import { attributesForCategory, type CategoryCatalog } from "@/domain/categories";
import { CONDITION_OPTIONS, CURRENCIES } from "@/domain/product";
import { ApiClientError, api, errorMessage } from "@/lib/api-client";
import { estimateMargin, formatBytes, formatPrice } from "@/lib/utils";
import { productSchema, type ProductFormValues, type ProductInput } from "@/validation/schemas";

export type FormImage = { id: string; url: string | null; filename: string; size: number };
export type SavedProduct = { id: string; name: string };

type Props = {
  catalog: CategoryCatalog;
  product?: { id: string } & Partial<Record<string, unknown>>;
  defaults?: Partial<ProductFormValues>;
  images?: FormImage[];
  maxImages: number;
  submitLabel: string;
  onSaved: (product: SavedProduct) => void | Promise<void>;
  secondaryAction?: React.ReactNode;
};

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function ProductForm({ catalog, product, defaults, images: initialImages = [], maxImages, submitLabel, onSaved, secondaryAction }: Props) {
  const [formError, setFormError] = useState<string | null>(null);
  const [images, setImages] = useState<FormImage[]>(initialImages);
  const [queued, setQueued] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [featureDraft, setFeatureDraft] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues, unknown, ProductInput>({
    resolver: zodResolver(productSchema),
    defaultValues: { name: "", description: "", categoryId: null, brand: "", model: "", price: "", currency: "EUR", costPrice: "", condition: "good", conditionCustom: "", sku: "", location: "", features: [], defects: "", attributes: {}, ...defaults },
  });

  const categoryId = useWatch({ control, name: "categoryId" }) as string | null;
  const condition = useWatch({ control, name: "condition" });
  const features = (useWatch({ control, name: "features" }) ?? []) as string[];
  const price = useWatch({ control, name: "price" });
  const costPrice = useWatch({ control, name: "costPrice" });
  const currency = useWatch({ control, name: "currency" }) ?? "EUR";

  const parents = useMemo(() => catalog.categories.filter((category) => !category.parentId), [catalog]);
  const selected = catalog.categories.find((category) => category.id === categoryId) ?? null;
  const parentId = selected ? (selected.parentId ?? selected.id) : "";
  const children = useMemo(() => catalog.categories.filter((category) => category.parentId === parentId), [catalog, parentId]);
  const attributes = useMemo(() => attributesForCategory(catalog, categoryId), [catalog, categoryId]);

  const toNumber = (value: unknown) => (value === "" || value === null || value === undefined ? null : Number(String(value).replace(",", ".")));
  const margin = estimateMargin(toNumber(price), toNumber(costPrice));
  const attributeErrors = (errors.attributes ?? {}) as Record<string, { message?: string } | undefined>;

  function addFeature() {
    const value = featureDraft.trim();
    if (!value) return;
    if (features.length >= 30) return void toast.error("Máximo 30 características.");
    if (!features.includes(value)) setValue("features", [...features, value.slice(0, 200)], { shouldDirty: true });
    setFeatureDraft("");
  }

  function pickFiles(list: FileList | null) {
    if (!list) return;
    const accepted: File[] = [];
    for (const file of Array.from(list)) {
      if (!ACCEPTED.includes(file.type)) toast.error(`${file.name}: formato no admitido (usa JPG, PNG o WebP).`);
      else if (file.size > MAX_IMAGE_BYTES) toast.error(`${file.name}: supera los 5 MB.`);
      else accepted.push(file);
    }
    const room = maxImages - images.length - queued.length;
    if (accepted.length > room) toast.error(`Tu plan permite ${maxImages} fotografías por producto.`);
    const selectedFiles = accepted.slice(0, Math.max(room, 0));
    if (product) void uploadFiles(product.id, selectedFiles);
    else setQueued((current) => [...current, ...selectedFiles]);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function uploadFiles(productId: string, files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    for (const file of files) {
      const formData = new FormData();
      formData.set("file", file);
      try {
        const image = await api<FormImage>(`/api/products/${productId}/images`, { formData });
        setImages((current) => [...current, image]);
      } catch (error) {
        toast.error(`${file.name}: ${errorMessage(error)}`);
      }
    }
    setUploading(false);
  }

  async function removeImage(image: FormImage) {
    if (!product) return;
    try {
      await api(`/api/products/${product.id}/images/${image.id}`, { method: "DELETE" });
      setImages((current) => current.filter((item) => item.id !== image.id));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    // Una casilla sin marcar significa "sin especificar", no una negación del atributo.
    values.attributes = Object.fromEntries(Object.entries(values.attributes).filter(([, value]) => value !== false));
    try {
      const saved = product
        ? await api<SavedProduct>(`/api/products/${product.id}`, { method: "PATCH", body: values })
        : await api<SavedProduct>("/api/products", { body: values });
      if (!product && queued.length > 0) {
        await uploadFiles(saved.id, queued);
        setQueued([]);
      }
      await onSaved(saved);
    } catch (error) {
      if (error instanceof ApiClientError) {
        for (const [field, message] of Object.entries(error.fields)) setError(field as keyof ProductFormValues, { message });
      }
      setFormError(errorMessage(error));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-5">
      <FormError message={formError} />

      <Card>
        <CardHeader title="Datos generales" description="Solo el nombre es obligatorio. Añade únicamente información real del producto." />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Nombre del producto" htmlFor="product-name" error={errors.name?.message} required className="sm:col-span-2">
            <Input placeholder="Ej.: Bicicleta de montaña Orbea MX 40" maxLength={200} {...fieldAria("product-name", errors.name?.message)} {...register("name")} />
          </Field>

          <Field label="Categoría" htmlFor="product-category" error={errors.categoryId?.message}>
            <Select
              id="product-category"
              value={parentId}
              onChange={(event) => {
                setValue("categoryId", event.target.value || null, { shouldDirty: true });
                setValue("attributes", {}, { shouldDirty: true });
              }}
            >
              <option value="">Sin categoría</option>
              {parents.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                  {category.isCustom ? " (personalizada)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Subcategoría" htmlFor="product-subcategory" optional>
            <Select id="product-subcategory" value={selected?.parentId ? selected.id : ""} disabled={children.length === 0} onChange={(event) => setValue("categoryId", event.target.value || parentId || null, { shouldDirty: true })}>
              <option value="">{children.length === 0 ? "No hay subcategorías" : "General"}</option>
              {children.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Marca" htmlFor="product-brand" error={errors.brand?.message} optional>
            <Input maxLength={120} {...fieldAria("product-brand", errors.brand?.message)} {...register("brand")} />
          </Field>
          <Field label="Modelo" htmlFor="product-model" error={errors.model?.message} optional>
            <Input maxLength={120} {...fieldAria("product-model", errors.model?.message)} {...register("model")} />
          </Field>

          <Field label="Estado" htmlFor="product-condition" error={errors.condition?.message} required>
            <Select {...fieldAria("product-condition", errors.condition?.message)} {...register("condition")}>
              {CONDITION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          {condition === "custom" ? (
            <Field label="Describe el estado" htmlFor="product-condition-custom" error={errors.conditionCustom?.message} required>
              <Input placeholder="Ej.: Restaurado, con piezas nuevas" maxLength={120} {...fieldAria("product-condition-custom", errors.conditionCustom?.message)} {...register("conditionCustom")} />
            </Field>
          ) : (
            <Field label="Ubicación" htmlFor="product-location" error={errors.location?.message} optional>
              <Input placeholder="Ciudad o zona" maxLength={160} {...fieldAria("product-location", errors.location?.message)} {...register("location")} />
            </Field>
          )}
          {condition === "custom" ? (
            <Field label="Ubicación" htmlFor="product-location" error={errors.location?.message} optional>
              <Input placeholder="Ciudad o zona" maxLength={160} {...fieldAria("product-location", errors.location?.message)} {...register("location")} />
            </Field>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHeader title="Precio y referencia" description="El coste de adquisición es privado: solo sirve para estimar tu margen." />
        <div className="grid gap-4 p-5 sm:grid-cols-4">
          <Field label="Precio" htmlFor="product-price" error={errors.price?.message as string | undefined}>
            <Input inputMode="decimal" placeholder="0,00" {...fieldAria("product-price", errors.price?.message as string | undefined)} {...register("price")} />
          </Field>
          <Field label="Moneda" htmlFor="product-currency" error={errors.currency?.message}>
            <Select {...fieldAria("product-currency", errors.currency?.message)} {...register("currency")}>
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Coste" htmlFor="product-cost" error={errors.costPrice?.message as string | undefined} optional>
            <Input inputMode="decimal" placeholder="0,00" {...fieldAria("product-cost", errors.costPrice?.message as string | undefined)} {...register("costPrice")} />
          </Field>
          <Field label="SKU / referencia" htmlFor="product-sku" error={errors.sku?.message} optional>
            <Input maxLength={80} {...fieldAria("product-sku", errors.sku?.message)} {...register("sku")} />
          </Field>
          {margin ? (
            <p className="text-[13px] text-muted sm:col-span-4">
              Margen estimado: <strong className={margin.amount >= 0 ? "text-success" : "text-danger"}>{formatPrice(margin.amount, currency)}</strong>
              {margin.percent !== null ? ` (${margin.percent.toLocaleString("es-ES")} % sobre el precio)` : ""}
            </p>
          ) : null}
        </div>
      </Card>

      {attributes.length > 0 ? (
        <Card>
          <CardHeader title={`Atributos de ${selected?.name ?? "la categoría"}`} description="Los campos con asterisco son los que más ayudan en esta categoría; si no conoces alguno, déjalo vacío." />
          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {attributes.map((attribute) => {
              const id = `attribute-${attribute.key}`;
              const error = attributeErrors[attribute.key]?.message;
              const label = attribute.unit ? `${attribute.name} (${attribute.unit})` : attribute.name;
              if (attribute.type === "boolean") {
                return (
                  <label key={attribute.key} className="flex items-center gap-2.5 self-end rounded-[10px] border border-line-strong bg-surface px-3 py-2.5 text-sm shadow-card">
                    <Checkbox {...register(`attributes.${attribute.key}`)} />
                    {attribute.name}
                  </label>
                );
              }
              return (
                <Field key={attribute.key} label={label} htmlFor={id} error={error} required={attribute.required}>
                  {attribute.type === "select" ? (
                    <Select {...fieldAria(id, error)} {...register(`attributes.${attribute.key}`)}>
                      <option value="">Sin especificar</option>
                      {attribute.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input inputMode={attribute.type === "number" ? "decimal" : undefined} maxLength={200} {...fieldAria(id, error)} {...register(`attributes.${attribute.key}`)} />
                  )}
                </Field>
              );
            })}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Descripción y características" />
        <div className="space-y-4 p-5">
          <Field label="Descripción original" htmlFor="product-description" error={errors.description?.message} hint="Escribe con tus palabras lo que sabes del producto. El generador la usará como base." optional>
            <Textarea rows={5} maxLength={10000} {...fieldAria("product-description", errors.description?.message)} {...register("description")} />
          </Field>

          <div className="space-y-1.5">
            <label htmlFor="product-feature" className="flex items-baseline gap-1.5 text-[13px] font-medium text-ink-soft">
              Características <span className="font-normal text-faint">opcional</span>
            </label>
            <div className="flex gap-2">
              <Input
                id="product-feature"
                value={featureDraft}
                onChange={(event) => setFeatureDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addFeature();
                  }
                }}
                placeholder="Ej.: Frenos de disco hidráulicos"
                maxLength={200}
              />
              <Button variant="secondary" onClick={addFeature} aria-label="Añadir característica">
                <Plus aria-hidden /> Añadir
              </Button>
            </div>
            {features.length > 0 ? (
              <ul className="flex flex-wrap gap-2 pt-1.5">
                {features.map((feature) => (
                  <li key={feature} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper py-1 pl-3 pr-1.5 text-[13px]">
                    {feature}
                    <button type="button" className="rounded-full p-0.5 text-muted hover:bg-sunken hover:text-danger" onClick={() => setValue("features", features.filter((item) => item !== feature), { shouldDirty: true })} aria-label={`Quitar ${feature}`}>
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <Field label="Defectos o detalles a tener en cuenta" htmlFor="product-defects" error={errors.defects?.message} hint="Se incluirán siempre en el anuncio. Ser transparente evita devoluciones y reclamaciones." optional>
            <Textarea rows={3} maxLength={3000} {...fieldAria("product-defects", errors.defects?.message)} {...register("defects")} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Fotografías" description={`JPG, PNG o WebP · máximo 5 MB · hasta ${maxImages} por producto. Se guardan en almacenamiento privado.`} />
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {images.map((image) => (
              <figure key={image.id} className="group relative aspect-square overflow-hidden rounded-xl border border-line bg-sunken">
                {image.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL firmada y temporal de Storage privado
                  <img src={image.url} alt={image.filename} className="size-full object-cover" loading="lazy" />
                ) : null}
                <button type="button" onClick={() => removeImage(image)} className="absolute right-1.5 top-1.5 rounded-lg bg-ink/75 p-1.5 text-white opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100" aria-label={`Eliminar ${image.filename}`}>
                  <Trash2 className="size-3.5" />
                </button>
              </figure>
            ))}
            {queued.map((file) => (
              <div key={`${file.name}-${file.size}`} className="relative flex aspect-square flex-col items-center justify-center rounded-xl border border-dashed border-line-strong bg-paper p-2 text-center">
                <p className="line-clamp-2 break-all text-xs font-medium">{file.name}</p>
                <p className="mt-1 text-[11px] text-muted">{formatBytes(file.size)} · se subirá al guardar</p>
                <button type="button" onClick={() => setQueued((current) => current.filter((item) => item !== file))} className="absolute right-1.5 top-1.5 rounded-lg p-1 text-muted hover:bg-sunken" aria-label={`Quitar ${file.name}`}>
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            {images.length + queued.length < maxImages ? (
              <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading} className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong text-muted transition-colors hover:border-brand hover:bg-brand-soft/40 hover:text-brand-strong">
                {uploading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <ImagePlus className="size-5" aria-hidden />}
                <span className="text-xs font-medium">{uploading ? "Subiendo…" : "Añadir foto"}</span>
              </button>
            ) : null}
          </div>
          <input ref={fileInput} type="file" accept={ACCEPTED.join(",")} multiple hidden onChange={(event) => pickFiles(event.target.files)} aria-label="Seleccionar fotografías" />
        </div>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-paper/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6">
        {secondaryAction}
        <Button type="submit" variant="brand" size="lg" loading={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
