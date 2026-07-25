export default function Privacy() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 font-display text-3xl font-semibold tracking-tight">Privacy Policy</h1>

      <section className="space-y-6 text-muted-foreground">
        <div>
          <h2 className="mb-3 text-xl font-semibold text-foreground">1. What this service is</h2>
          <p>
            Clippa is a personal-use YouTube clipping tool. It processes video URLs you
            provide to create short downloadable clips. There is no public account system
            or social profile.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold text-foreground">2. Information we handle</h2>
          <p>
            We may store the YouTube URLs you submit, clip job status, and a local download
            counter so the app can finish processing and show progress. Clip files are
            temporary and cleaned up after a short TTL. We do not sell your data.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold text-foreground">3. Cookies and analytics</h2>
          <p>
            Essential app operation may use local storage or cookies. Anonymous product
            analytics (e.g. Vercel Analytics) may run in production to understand usage.
            You can block third-party scripts in your browser if you prefer.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold text-foreground">4. Third parties</h2>
          <p>
            Video metadata and media are fetched from YouTube via yt-dlp on the server.
            Your use of YouTube content remains subject to YouTube&apos;s terms and copyright
            rules.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold text-foreground">5. Contact</h2>
          <p>
            Questions about this policy:{" "}
            <a className="text-primary underline-offset-4 hover:underline" href="mailto:iamamrit27@gmail.com">
              iamamrit27@gmail.com
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}
