import { useRoute } from "./lib/route";
import { Masthead } from "./components/Masthead";
import { Footer } from "./components/Footer";
import { Home } from "./views/Home";
import { Season } from "./views/Season";

export function App({ now: fixedNow }: { now?: Date }) {
  const page = useRoute();
  const now = fixedNow ?? new Date();
  return (
    <div className="app">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Masthead page={page} now={now} />
      <main id="main" className="page" tabIndex={-1}>
        {page === "season" ? <Season now={now} /> : <Home now={now} />}
      </main>
      <Footer />
    </div>
  );
}
