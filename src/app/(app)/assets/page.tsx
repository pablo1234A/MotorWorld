import { AssetLibrary } from "@/components/asset-library";

export const metadata = { title: "Recursos" };

export default function AssetsPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 pt-20 pb-16 lg:px-10 lg:pt-12">
      <header className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-tight">Biblioteca de recursos</h1>
        <p className="mt-1 text-[13px] text-muted">Imágenes, vídeos y fuentes compartidos entre todos tus proyectos. Se validan por su contenido real, no por la extensión.</p>
      </header>
      <AssetLibrary />
    </div>
  );
}
