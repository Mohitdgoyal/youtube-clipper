export default function Terms() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 font-display text-3xl font-semibold tracking-tight">Terms of Use</h1>

      <section className="space-y-6 text-muted-foreground">
        <div>
          <h2 className="mb-3 text-xl font-semibold text-foreground">1. Personal use</h2>
          <p>
            Clippa is provided for personal, non-commercial clipping of YouTube content you
            are allowed to download under applicable law and YouTube&apos;s terms. You are
            responsible for the URLs you submit and how you use the resulting files.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold text-foreground">2. No warranty</h2>
          <p>
            The service is provided as-is. Downloads may fail when YouTube changes its
            APIs, rate-limits requests, or blocks automated access. We do not guarantee
            uptime, format availability, or subtitle accuracy.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold text-foreground">3. Acceptable use</h2>
          <p>
            Do not use Clippa to infringe copyright, abuse infrastructure, or circumvent
            access controls. Automated bulk scraping beyond normal personal use may be
            rate-limited or blocked.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold text-foreground">4. Contact</h2>
          <p>
            Questions:{" "}
            <a className="text-primary underline-offset-4 hover:underline" href="mailto:iamamrit27@gmail.com">
              iamamrit27@gmail.com
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}
