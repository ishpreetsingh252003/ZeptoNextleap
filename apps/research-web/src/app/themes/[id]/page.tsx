import { ThemeDetail } from "./theme-detail";
export default async function ThemePage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <ThemeDetail themeId={id} />; }
