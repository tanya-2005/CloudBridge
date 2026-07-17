import { Logo } from "@/components/layout/logo";

export function PublicFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
        <Logo className="opacity-80" />
        <p className="text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} CloudBridge. Local development build — no data leaves your machine.
        </p>
      </div>
    </footer>
  );
}
