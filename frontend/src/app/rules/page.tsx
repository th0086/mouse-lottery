"use client";

import { useEffect, useMemo, useState } from "react";
import { Inter, Itim } from "next/font/google";
import { apiFetch } from "../../lib/apiClient";
import "../../styles/rules.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--rules-font-sans",
});

const itim = Itim({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--rules-font-display",
});

type MissionThresholds = {
  turnoverMissionThreshold: number;
  depositMissionThreshold: number;
};

type RulesGameState = {
  missionThresholds?: MissionThresholds;
};

const baseMissionRules = [
  { mission: "Daily check-in", chances: "1" },
  {
    mission:
      "Share the invitation link and successfully invite a friend to register for Ke7",
    chances: "1",
  },
  { mission: "Make a top-up of any amount", chances: "1" },
  { mission: "Complete one qualifying participation activity", chances: "1" },
  { mission: "Accumulate 1,000 valid turnover within Ke7", chances: "1" },
  { mission: "Complete all daily tasks", chances: "1" },
];

const ruleHeadings = [
  "Eligibility",
  "Number Selection",
  "Qualified Result",
  "Prize Distribution",
  "Bets Rule",
  "Result Validation Rule",
  "Winning Number Determination",
];

function ChevronIcon() {
  return (
    <svg
      className="rules-accordion-icon"
      viewBox="0 0 22.7071 12.0607"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M0.353553 0.353553L11.3536 11.3536L22.3536 0.353553"
        stroke="currentColor"
      />
    </svg>
  );
}

export default function RulesPage() {
  const [openRuleId, setOpenRuleId] = useState<number>(1);
  const [thresholds, setThresholds] = useState<MissionThresholds | null>(null);

  // Mission thresholds are static config, so a single fetch is enough — the
  // page no longer shows the live jackpot and does not need to poll.
  useEffect(() => {
    let active = true;

    const fetchThresholds = async () => {
      const response = await apiFetch("/api/game/state", { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as RulesGameState;
      if (active && payload.missionThresholds) {
        setThresholds(payload.missionThresholds);
      }
    };

    fetchThresholds();

    return () => {
      active = false;
    };
  }, []);

  const missionRules = useMemo(() => {
    const depositThreshold = thresholds?.depositMissionThreshold ?? 200;
    const turnoverThreshold = thresholds?.turnoverMissionThreshold ?? 1000;

    return baseMissionRules.map((item) => {
      if (item.mission === "Make a top-up of any amount") {
        return {
          ...item,
          mission: `Make a top-up of ${depositThreshold} amount`,
        };
      }

      if (item.mission === "Accumulate 1,000 valid turnover within Ke7") {
        return {
          ...item,
          mission: `Accumulate ${turnoverThreshold} valid turnover within Ke7`,
        };
      }

      return item;
    });
  }, [
    thresholds?.depositMissionThreshold,
    thresholds?.turnoverMissionThreshold,
  ]);

  const renderRuleContent = (ruleId: number) => {
    switch (ruleId) {
      case 1:
        return (
          <div className="rule-detail-block">
            <p>
              Players may earn Betting chances by completing Daily Missions. The
              tasks are listed below:
            </p>
            <div className="eligibility-table-wrap">
              <table className="eligibility-table">
                <thead>
                  <tr>
                    <th>Missions</th>
                    <th>Betting chances</th>
                  </tr>
                </thead>
                <tbody>
                  {missionRules.map((item, index) => (
                    <tr key={`${index}-${item.mission}`}>
                      <td>{item.mission}</td>
                      <td>{item.chances}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>Betting chances will reset daily at 23:59.</p>
          </div>
        );
      case 2:
        return (
          <ul className="rule-bullets">
            <li>
              Players must choose 4 digits from 0–9 as their selected numbers.
            </li>
            <li>
              Once confirmed, the selected numbers are locked and cannot be
              changed.
            </li>
          </ul>
        );
      case 3:
        return (
          <p>
            If the Hamster Spin Machine reveals the same 4 digits selected by
            the player during the next valid draw cycle, that entry will be
            considered qualified and will be eligible for the promotional prize.
          </p>
        );
      case 4:
        return (
          <ul className="rule-bullets">
            <li>
              The promotional prize will be shared equally among all qualified
              players.
            </li>
            <li>
              Example: if the prize pool is 10,000 KES and there are 2 qualified
              players, each player will receive 5,000 KES.
            </li>
          </ul>
        );
      case 5:
        return (
          <ul className="rule-bullets">
            <li>
              Players may use their earned entry chances to participate multiple
              times each day.
            </li>
            <li>
              After a player selects 4 digits, result validation begins after 4
              new digits have been revealed; from that starting point, once 49
              additional drawn digits have appeared, that 4-digit entry record
              will expire.
            </li>
            <li>
              Example: if the draw result at the time of entry is{" "}
              <span className="rules-accent">1-2-3-4</span> and the next
              complete draw result is{" "}
              <span className="rules-accent">5-6-7-8</span>, that entry becomes
              effective starting from{" "}
              <span className="rules-accent">5-6-7-8</span>, which is the next
              complete draw result, and it expires after 49 additional drawn
              digits appear following{" "}
              <span className="rules-accent">5-6-7-8</span>.
            </li>
            <li>
              Each entry&apos;s prize eligibility is still subject to Section 6,
              Prize Validation Rule.
            </li>
          </ul>
        );
      case 6:
        return (
          <div className="rule-detail-block">
            <p>
              A player&apos;s selected numbers become eligible for result
              comparison starting from the next complete draw result after the
              current one, and remain valid within the applicable validation
              window.
            </p>
            <ul className="rule-bullets">
              <li>
                The selected numbers will not be compared against the current
                draw result that is already in progress or already formed.
              </li>
              <li>
                Any sequential combination that includes the current draw result
                and overlaps into the next draw result will be considered
                invalid.
              </li>
              <li>
                Only complete 4-digit combinations starting from the next
                complete draw result, and falling within the valid period, may
                be recognized as valid qualified results.
              </li>
            </ul>
            <div className="rules-example-box">
              <p className="rules-example-title">Example</p>
              <p>
                If the current draw result is{" "}
                <span className="rules-accent">1–2–3–4</span> and the next
                complete draw result is{" "}
                <span className="rules-accent">5–6–7–8</span>, the player&apos;s
                valid result comparison window begins from{" "}
                <span className="rules-accent">5–6–7–8</span>.
              </p>
              <p>
                Combinations such as{" "}
                <span className="rules-accent">1–2–3–4, 2–3–4–5, 3–4–5–6</span>,
                and <span className="rules-accent">4–5–6–7</span> are invalid
                sequences and do not qualify.
              </p>
              <p>
                Only when <span className="rules-accent">5–6–7–8</span>, or a
                later complete draw combination that still falls within the
                valid period, matches the player&apos;s selected 4 digits
                exactly, will it be recognized as a qualified result.
              </p>
            </div>
            <p>
              In other words, the result comparison window begins only after the
              current draw result has fully ended. Any overlapping or extended
              sequence that bridges the current draw result and the next draw
              result will not be counted as valid.
            </p>
          </div>
        );
      case 7:
        return (
          <p>
            The winning number is determined by the number at which the hamster
            finally stops in the direction it is running. If the wheel rolls
            backward due to rebound force and returns to a previous position,
            that rebound position will not be considered the winning number.
          </p>
        );
      default:
        return null;
    }
  };

  return (
    <main className={`rules-page ${inter.variable} ${itim.variable}`}>
      <div className="rules-banner">
        <img src="/rules-banner.jpg" alt="" aria-hidden="true" />
      </div>

      <div className="rules-content">
        <h1 className="rules-title">How to Play Hamster Spin</h1>

        <div className="rules-back-row">
          <a className="rules-back-link" href="/">
            Back to Game
          </a>
        </div>

        <div className="rules-accordion">
          {ruleHeadings.map((heading, index) => {
            const ruleId = index + 1;
            const isOpen = openRuleId === ruleId;

            return (
              <article
                key={heading}
                className={`rules-accordion-item ${isOpen ? "is-open" : ""}`}
              >
                <button
                  type="button"
                  className="rules-accordion-trigger"
                  aria-expanded={isOpen}
                  onClick={() =>
                    setOpenRuleId((current) =>
                      current === ruleId ? 0 : ruleId,
                    )
                  }
                >
                  <span>
                    {ruleId}. {heading}
                  </span>
                  <ChevronIcon />
                </button>
                {isOpen ? (
                  <div className="rules-accordion-content">
                    {renderRuleContent(ruleId)}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>

      <footer className="site-footer rules-footer">
        <p>© 2025 Hamster Spin. Powered by KE7.</p>
        <p>Play responsibly. Must be 18+ to participate.</p>
      </footer>
    </main>
  );
}
