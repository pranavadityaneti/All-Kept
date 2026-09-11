import type { Metadata } from "next";
import { LegalPage } from "../../components/LegalPage";

export const metadata: Metadata = { title: "Delete Your Data" };

export default function DeletePage() {
  return <LegalPage name="delete" />;
}
