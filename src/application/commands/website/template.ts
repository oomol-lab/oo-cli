// Each website is served from the root of its own hostname. The edge in front
// of it reserves `/_sitelive/` and accepts only `POST /_sitelive/inquiry` there.
export function websiteTemplate(name: string): Record<string, string> {
    return {
        "public/favicon.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><rect width=\"32\" height=\"32\" rx=\"6\" fill=\"#284f38\"/><path d=\"M10 8v16h13v-4h-9V8z\" fill=\"white\"/></svg>",
        "package.json": JSON.stringify({
            name: "website",
            private: true,
            type: "module",
            scripts: { dev: "astro dev", build: "astro build" },
            dependencies: { "astro": "6.4.2", "@astrojs/cloudflare": "13.6.1" },
            devDependencies: { wrangler: "4.111.0" },
        }, null, 2),
        ".gitignore": "node_modules/\ndist/\n.astro/\n.wrangler/\n.sitelive-build/\n.dev.vars*\n.sitelive-*.json\n",
        "astro.config.mjs": `import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  output: "server",
  adapter: cloudflare({ imageService: "passthrough" }),
});
`,
        "wrangler.jsonc": JSON.stringify({
            name: "website-build",
            main: "./src/worker.ts",
            compatibility_date: "2026-07-15",
            compatibility_flags: ["nodejs_compat"],
            assets: { directory: "./dist/client", binding: "ASSETS", run_worker_first: true },
        }, null, 2),
        "src/worker.ts": `import { handle } from "@astrojs/cloudflare/handler";
export default { fetch: handle };
`,
        "src/site.json": JSON.stringify({ name, description: "Tell your customers about your products and services." }, null, 2),
        "src/layouts/Site.astro": `---
import site from "../site.json";
const { title, description = site.description } = Astro.props;
const base = import.meta.env.BASE_URL.replace(/\\/?$/, "/");
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="description" content={description} />
    <title>{title} | {site.name}</title>
    <link rel="icon" href={base + "favicon.svg"} type="image/svg+xml" />
  </head>
  <body>
    <header>
      <a href={base}>{site.name}</a>
      <nav aria-label="Main navigation">
        <a href={base + "products/"}>Products</a>
        <a href={base + "contact/"}>Contact</a>
      </nav>
    </header>
    <main><slot /></main>
    <footer>{site.name}</footer>
  </body>
</html>
<style is:global>
  :root { font-family: system-ui, sans-serif; color: #202621; background: #fafbf8; }
  body { margin: 0 auto; max-width: 960px; padding: 24px; }
  header { display: flex; justify-content: space-between; gap: 24px; padding: 16px 0; border-bottom: 1px solid #dce0d8; }
  nav { display: flex; gap: 20px; }
  a { color: inherit; text-underline-offset: 4px; }
  main { padding: 64px 0; min-height: 55vh; }
  h1 { font-size: clamp(32px, 5vw, 52px); line-height: 1.1; }
  p { line-height: 1.7; }
  form { display: grid; gap: 16px; max-width: 520px; }
  label { display: grid; gap: 8px; }
  input, textarea, button { font: inherit; padding: 12px; border-radius: 6px; border: 1px solid #a4aea0; }
  button { cursor: pointer; background: #284f38; color: white; }
  footer { padding: 24px 0; border-top: 1px solid #dce0d8; }
</style>
`,
        "src/pages/index.astro": `---
import Site from "../layouts/Site.astro";
import site from "../site.json";
---
<Site title="Home">
  <h1>{site.name}</h1>
  <p>{site.description}</p>
  <a href={import.meta.env.BASE_URL + "products/"}>Explore our products</a>
</Site>
`,
        "src/pages/products/index.astro": `---
import Site from "../../layouts/Site.astro";
---
<Site title="Products">
  <h1>Our products</h1>
  <p>Learn about our featured product.</p>
  <a href={import.meta.env.BASE_URL + "products/featured/"}>View product details</a>
</Site>
`,
        "src/pages/products/featured.astro": `---
import Site from "../../layouts/Site.astro";
---
<Site title="Featured product">
  <h1>Featured product</h1>
  <p>Add verified product specifications, images and features here.</p>
  <a href={import.meta.env.BASE_URL + "contact/"}>Send an inquiry</a>
</Site>
`,
        "src/pages/contact.astro": `---
import Site from "../layouts/Site.astro";
---
<Site title="Contact">
  <h1>Contact us</h1>
  <form data-inquiry-form>
    <label>Email<input name="email" type="email" required maxlength="254" /></label>
    <label>Message<textarea name="message" required maxlength="2000"></textarea></label>
    <button type="submit">Send inquiry</button>
    <output role="status"></output>
  </form>
</Site>
<script>
  // The id stays the same while one inquiry is retried, so the platform
  // stores it only once.
  for (const form of document.querySelectorAll<HTMLFormElement>("form[data-inquiry-form]")) {
    let id = crypto.randomUUID();
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const status = form.querySelector("output")!;
      const button = form.querySelector("button")!;
      const data = new FormData(form);
      button.disabled = true;
      try {
        const response = await fetch("/_sitelive/inquiry", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, email: data.get("email"), message: data.get("message"), path: location.pathname }),
        });
        if (response.ok) {
          form.reset();
          id = crypto.randomUUID();
          status.textContent = "Thank you. We will get back to you soon.";
        }
        else {
          status.textContent = response.status === 429
            ? "Too many requests. Please try again in a minute."
            : "Your inquiry could not be sent. Please try again.";
        }
      }
      catch {
        status.textContent = "Your inquiry could not be sent. Please try again.";
      }
      finally {
        button.disabled = false;
      }
    });
  }
</script>
`,
        "src/pages/404.astro": `---
import Site from "../layouts/Site.astro";
Astro.response.status = 404;
---
<Site title="Page not found"><h1>Page not found</h1></Site>
`,
    };
}
