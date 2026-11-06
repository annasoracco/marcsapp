import { useEffect, useMemo, useState } from "react";
import type { Scenario } from "../lib/engine";
import { cardFileName, renderShareCard } from "../lib/shareCard";
import { Sheet } from "./Sheet";

interface Props {
  scenario: Scenario;
  name: string;
  cpiMonth: string;
  isBenchmark: boolean;
  onClose: () => void;
}

type Status = { kind: "idle" } | { kind: "saved" };

function download(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Previews the card, then shares it with the phone's share sheet or saves it as a file. All on the device. */
export function ShareSheet({ scenario, name, cpiMonth, isBenchmark, onClose }: Props) {
  const [card, setCard] = useState<{ blob: Blob; url: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const filename = cardFileName(scenario);

  useEffect(() => {
    let url = "";
    let alive = true;
    renderShareCard(scenario, { cpiMonth, name, isBenchmark })
      .then((blob) => {
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setCard({ blob, url });
      })
      .catch((e: Error) => alive && setFailed(e.message));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [scenario, cpiMonth, name, isBenchmark]);

  const file = useMemo(() => (card ? new File([card.blob], filename, { type: "image/png" }) : null), [card, filename]);
  const canShareFiles = !!file && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });

  const share = () => {
    if (!file || !card) return;
    // Called straight from the tap so Safari keeps the user gesture.
    navigator.share({ files: [file] }).catch((e: DOMException) => {
      if (e?.name === "AbortError") return;
      download(card.url, filename);
      setStatus({ kind: "saved" });
    });
  };
  const save = () => {
    if (!card) return;
    download(card.url, filename);
    setStatus({ kind: "saved" });
  };

  return (
    <Sheet title="Share this" onClose={onClose}>
      <div className="card-preview">
        {card ? (
          <img src={card.url} alt={`Share card: ${name}, ${filename}`} width={540} height={960} />
        ) : failed ? (
          <p className="problem">The image couldn’t be made on this phone ({failed}).</p>
        ) : (
          <p className="quiet">Making the image…</p>
        )}
      </div>
      <div className="form-actions">
        {canShareFiles && (
          <button type="button" className="btn primary" onClick={share} disabled={!card}>
            Share image
          </button>
        )}
        <button type="button" className={`btn ${canShareFiles ? "secondary" : "primary"}`} onClick={save} disabled={!card}>
          Save image
        </button>
      </div>
      <p className="quiet" aria-live="polite">
        {status.kind === "saved"
          ? "Saved. On an iPhone, look in Files › Downloads, or press and hold the picture above to add it to Photos."
          : "Made on this phone. Nothing is uploaded. On an iPhone you can also press and hold the picture to save it."}
      </p>
    </Sheet>
  );
}
