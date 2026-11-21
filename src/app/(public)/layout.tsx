import { Footer, PublicNav } from "@/components/shell";
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (<><PublicNav /><main id="main" tabIndex={-1} className="outline-none">{children}</main><Footer /></>);
}
