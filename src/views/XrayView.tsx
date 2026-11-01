import { useMemo } from "react";
import { useStore } from "../lib/store";
import { useMarket } from "../lib/market";
import { buildXray, type CombinedPosition } from "../lib/xray";
import { plural, weight } from "../lib/format";
import { tickerHref } from "../lib/route";
import { BarList, Card, Empty, StackedBar } from "../components/ui";

export function XrayView() {
  const { state, dispatch } = useStore();
  const ms = useMarket();
  const data = ms.status === "ready" ? ms.data : undefined;
  const threshold = state.settings.concentrationPct;
  const x = useMemo(
    () => (data ? buildXray(state.accounts, data.market, data.funds, threshold) : null),
    [data, state.accounts, threshold],
  );

  if (state.accounts.length === 0) {
    return (
      <>
        <div className="page-head">
          <h1 tabIndex={-1}>Account X-ray</h1>
        </div>
        <Card>
          <p>
            See all your accounts as one portfolio: overlap, concentration, sectors, and what your funds really own. In
            percentages only. Nothing leaves this phone.
          </p>
          <div className="form-actions">
            <a className="btn primary" href="#/xray/account/new">
              + Add an account
            </a>
            <button type="button" className="btn ghost" onClick={() => dispatch({ type: "loadSample" })}>
              Explore with sample accounts
            </button>
          </div>
        </Card>
      </>
    );
  }
  if (!x || !data) return <p className="muted">Loading market data…</p>;

  const label = (p: CombinedPosition) => (
    <>
      <span className="sym">{p.label}</span>
      {p.name && <span className="muted name-inline"> {p.name}</span>}
      {!p.covered && p.key !== "UNASSIGNED" && <span className="tag">not covered yet</span>}
    </>
  );

  return (
    <>
      <div className="page-head">
        <h1 tabIndex={-1}>Account X-ray</h1>
        <a className="btn primary" href="#/xray/account/new">
          + Account
        </a>
      </div>
      <p className="lede">
        {plural(state.accounts.length, "account")} · {plural(x.positions.length, "position")} · percentages of your whole
        portfolio
      </p>

      <Card id="conc" title={`Concentration (over ${threshold}%)`} action={<a className="link small" href="#/more">Change</a>}>
        {x.concentration.length === 0 && x.exposureAlerts.length === 0 ? (
          <Empty>Nothing over {threshold}%. Nicely spread out.</Empty>
        ) : (
          <ul className="alerts">
            {x.concentration.map((p) => (
              <li key={p.key} className={p.type === "Stock" ? "alert warn" : "alert"}>
                <strong>{p.label}</strong> is {weight(p.weight)} of your portfolio
                {p.type === "ETF" || p.type === "Mutual fund" ? <span className="muted"> · a diversified fund, usually fine</span> : p.type === "Cash" ? <span className="muted"> · cash</span> : null}
              </li>
            ))}
            {x.exposureAlerts
              .filter((e) => !x.concentration.some((p) => p.symbol === e.symbol))
              .map((e) => (
                <li key={`exp-${e.symbol}`} className="alert warn">
                  <strong>{e.symbol}</strong> is really {weight(e.total)} once you count what your funds hold
                </li>
              ))}
          </ul>
        )}
      </Card>

      <Card id="alloc" title="Combined allocation">
        <BarList
          items={x.positions.slice(0, 15).map((p) => ({
            key: p.key,
            label: label(p),
            sub: p.accounts.length > 1 ? `in ${plural(p.accounts.length, "account")}` : p.accounts[0]?.name,
            weight: p.weight,
            href: p.symbol ? tickerHref(p.symbol) : undefined,
            tone: p.weight > threshold / 100 && p.type === "Stock" ? "warn" : undefined,
          }))}
        />
        {x.positions.length > 15 && <p className="fine">Plus {plural(x.positions.length - 15, "smaller position")}.</p>}
      </Card>

      <Card id="true" title="True exposure (look-through)">
        {x.exposures.length === 0 ? (
          <Empty>Add stocks or funds to see what you really own.</Empty>
        ) : (
          <>
            <p className="fine">What you own directly plus what your ETFs and funds hold in their top 10s.</p>
            <BarList
              items={x.exposures.slice(0, 12).map((e) => ({
                key: e.symbol,
                label: (
                  <>
                    <span className="sym">{e.symbol}</span>
                    <span className="muted name-inline"> {e.name}</span>
                  </>
                ),
                sub:
                  e.via.length === 0
                    ? "direct only"
                    : `${e.direct > 0 ? `${weight(e.direct)} direct + ` : ""}${weight(e.total - e.direct)} via ${e.via
                        .slice(0, 3)
                        .map((v) => v.fund)
                        .join(", ")}${e.via.length > 3 ? "…" : ""}`,
                weight: e.total,
                href: tickerHref(e.symbol),
                tone: e.total > threshold / 100 ? "warn" : undefined,
              }))}
            />
            <p className="fine">
              {weight(x.lookThroughShare)} of your portfolio is in funds we can see inside. {weight(x.otherFundHoldings)} sits in
              fund holdings beyond their top 10s.
            </p>
          </>
        )}
      </Card>

      <Card id="overlap" title="Overlap">
        {x.overlap.length === 0 ? (
          <Empty>No ticker shows up in more than one account.</Empty>
        ) : (
          <ul className="overlap">
            {x.overlap.map((p) => (
              <li key={p.key}>
                <div className="bar-row">
                  <a className="sym" href={p.symbol ? tickerHref(p.symbol) : undefined}>
                    {p.label}
                  </a>
                  <span className="bar-value">{weight(p.weight)} combined</span>
                </div>
                <div className="bar-sub">{p.accounts.map((a) => `${a.name} ${weight(a.weight)}`).join(" · ")}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card id="sectors" title="Sector mix">
        <BarList items={x.sectors.map((s) => ({ key: s.label, label: s.label, weight: s.weight }))} />
        <p className="fine">Funds are split by their own sector weights; bond and cash portions are shown separately.</p>
      </Card>

      <Card id="types" title="Asset type mix">
        <StackedBar slices={x.assetTypes} label="Asset types" />
        <h3 className="sub-h">Stocks vs bonds vs cash (look-through)</h3>
        <StackedBar slices={x.assetClasses} label="Asset classes" />
      </Card>

      <section aria-labelledby="accts-h">
        <h2 id="accts-h" className="section-h">
          Per account
        </h2>
        {x.accounts.map((a) => (
          <Card
            key={a.account.id}
            title={
              <>
                {a.account.name} <span className="tag">{a.account.type}</span>
              </>
            }
            action={
              <a className="btn ghost small" href={`#/xray/account/${a.account.id}`} aria-label={`Edit ${a.account.name}`}>
                Edit
              </a>
            }
          >
            <p className="lede small">
              {weight(a.weight)} of your portfolio{a.estimatedWeight ? " (estimated, set it in Edit)" : ""}
            </p>
            {a.positions.length === 0 && a.unassigned === 0 ? (
              <Empty>No holdings yet.</Empty>
            ) : (
              <>
                <StackedBar slices={a.types} label={`${a.account.name} asset types`} />
                <BarList
                  items={[
                    ...a.positions.slice(0, 6).map((p) => ({
                      key: p.key,
                      label: (
                        <>
                          <span className="sym">{p.label}</span>
                          {!p.covered && <span className="tag">not covered yet</span>}
                        </>
                      ),
                      weight: p.weight,
                      href: p.symbol ? tickerHref(p.symbol) : undefined,
                    })),
                    ...(a.unassigned > 0 ? [{ key: "un", label: "Not assigned", weight: a.unassigned, tone: "muted" as const }] : []),
                  ]}
                  max={1}
                />
                {a.positions.length > 6 && <p className="fine">Plus {plural(a.positions.length - 6, "more holding")}.</p>}
              </>
            )}
            {a.warnings.map((w) => (
              <p key={w} className="hint warn">
                {w}
              </p>
            ))}
          </Card>
        ))}
      </section>
    </>
  );
}
