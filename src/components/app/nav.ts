import { BarChart3, FileStack, Heart, LayoutDashboard, LayoutTemplate, Megaphone, Package, PenLine, Settings, UserRound, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean; shortcut?: string };

export const APP_NAV: { title?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true, shortcut: "g d" },
      { href: "/app/crear", label: "Crear anuncio", icon: PenLine, shortcut: "n" },
      { href: "/app/masivo", label: "Anuncios masivos", icon: FileStack, shortcut: "g m" },
    ],
  },
  {
    title: "Catálogo",
    items: [
      { href: "/app/productos", label: "Mis productos", icon: Package, shortcut: "g p" },
      { href: "/app/anuncios", label: "Mis anuncios", icon: Megaphone, shortcut: "g a" },
      { href: "/app/plantillas", label: "Plantillas", icon: LayoutTemplate },
      { href: "/app/favoritos", label: "Favoritos", icon: Heart },
      { href: "/app/estadisticas", label: "Estadísticas", icon: BarChart3 },
    ],
  },
  {
    title: "Cuenta",
    items: [
      { href: "/app/cuenta", label: "Mi cuenta", icon: UserRound },
      { href: "/app/configuracion", label: "Configuración", icon: Settings },
    ],
  },
];

export const SHORTCUTS: { keys: string; label: string; href?: string }[] = [
  { keys: "n", label: "Crear anuncio", href: "/app/crear" },
  { keys: "g d", label: "Ir al dashboard", href: "/app" },
  { keys: "g p", label: "Ir a mis productos", href: "/app/productos" },
  { keys: "g a", label: "Ir a mis anuncios", href: "/app/anuncios" },
  { keys: "g m", label: "Ir a anuncios masivos", href: "/app/masivo" },
  { keys: "/", label: "Buscar en la lista actual" },
  { keys: "?", label: "Mostrar esta ayuda" },
];
