interface PageHeroProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  note?: string;
}

/** Shared hero band for top-level pages (menu, gallery, reviews, contacts). */
export function PageHero({ eyebrow, title, subtitle, note }: PageHeroProps) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-white to-pizza-cream">
      <div className="pointer-events-none absolute -right-20 -top-16 h-64 w-64 rounded-full bg-pizza-red-light blur-3xl" />
      <div className="container relative py-14 text-center sm:py-16">
        {eyebrow && (
          <span className="inline-block rounded-full border border-pizza-green/30 bg-white/70 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-pizza-green">
            {eyebrow}
          </span>
        )}
        <h1 className="mt-4 text-4xl font-bold text-pizza-ink sm:text-5xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mx-auto mt-4 max-w-xl text-lg text-pizza-muted">
            {subtitle}
          </p>
        )}
        {note && <p className="mt-2 text-sm text-pizza-muted/80">{note}</p>}
      </div>
    </section>
  );
}
