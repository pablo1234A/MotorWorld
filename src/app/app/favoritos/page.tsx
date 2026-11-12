import type { Metadata } from "next";
import { ListingsPage } from "@/components/app/listings-page";

export const metadata: Metadata = { title: "Favoritos" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <ListingsPage params={await searchParams} favorites />;
}
