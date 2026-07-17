import { Link } from "react-router-dom";
import {
  ArrowRight,
  GitBranchPlus,
  History,
  Radar,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "@/components/layout/public-footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useMigration } from "@/context/migration-context";
import { cn } from "@/lib/utils";

const FEATURES = [
  {
    icon: Zap,
    title: "Direct streaming transfers",
    description: "Files stream straight from source to destination — no slow round-trips through local disk.",
  },
  {
    icon: GitBranchPlus,
    title: "Smart duplicate handling",
    description: "Skip, replace, rename, or get asked — you decide how conflicts are resolved.",
  },
  {
    icon: Radar,
    title: "Real-time progress",
    description: "Live per-file and overall progress tracking, so you always know what's happening.",
  },
  {
    icon: ShieldCheck,
    title: "Credentials stay local",
    description: "Nothing is proxied through third-party servers — connections run from your machine.",
  },
  {
    icon: History,
    title: "Resilient by design",
    description: "Transient failures retry automatically; one bad file never stalls the whole migration.",
  },
  {
    icon: Sparkles,
    title: "Built for more clouds",
    description: "A provider-agnostic core makes adding Dropbox, OneDrive, S3 and Box straightforward.",
  },
];

export function HomePage() {
  const { providers } = useMigration();

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-40 -z-10 flex justify-center blur-3xl"
          >
            <div className="h-[420px] w-[720px] rounded-full bg-gradient-to-tr from-primary/30 via-primary/10 to-transparent" />
          </div>

          <div className="mx-auto flex max-w-4xl flex-col items-center px-4 py-20 text-center sm:px-6 sm:py-28">
            <Badge variant="secondary" className="mb-5">
              <Sparkles className="h-3 w-3" /> Now migrating MEGA → Google Drive
            </Badge>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
              Move your files between{" "}
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                clouds
              </span>
              , effortlessly.
            </h1>
            <p className="mt-5 max-w-2xl text-balance text-base text-muted-foreground sm:text-lg">
              CloudBridge migrates your files directly from one cloud storage provider to another —
              with live progress tracking and smart duplicate handling along the way.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link to="/dashboard">
                  Get Started <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/transfer">See how it works</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Providers */}
        <section className="border-y border-border bg-card/40 py-10">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="mb-5 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Supported providers
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {providers.map((provider) => (
                <div
                  key={provider.id}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium",
                    provider.available
                      ? "border-border bg-background"
                      : "border-dashed border-border/70 text-muted-foreground opacity-70"
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full", provider.available ? "bg-success" : "bg-muted-foreground/40")} />
                  {provider.name}
                  {!provider.available && (
                    <span className="text-[10px] uppercase tracking-wide">soon</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight">
              Everything you need for a clean migration
            </h2>
            <p className="mt-3 text-muted-foreground">
              Purpose-built for moving files between clouds without the busywork.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <Card key={title} className="transition-shadow hover:shadow-md">
                <CardContent className="p-6">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-border">
          <div className="mx-auto flex max-w-4xl flex-col items-center px-4 py-20 text-center sm:px-6">
            <h2 className="text-3xl font-semibold tracking-tight">
              Ready to migrate your files?
            </h2>
            <p className="mt-3 max-w-lg text-muted-foreground">
              Connect MEGA and Google Drive, pick a folder, and let CloudBridge handle the rest.
            </p>
            <Button asChild size="lg" className="mt-8">
              <Link to="/dashboard">
                Open Dashboard <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
