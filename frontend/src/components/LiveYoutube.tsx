"use client";

import { useMemo, useState } from "react";
import { FreeBetsPill } from "./FreeBetsPill";
import { Wheel } from "./Wheel";

type LiveTicketItem = {
  id: string;
  numbers: number[];
  status: string;
  detailText: string;
};

type Props = {
  videoId?: string;
  overlayEnabled: boolean;
  latestNumber?: number;
  announcementEnabled?: boolean;
  announcementContent?: string;
  todayTotal: number;
  freeBetsCount: number;
  ticketItems: LiveTicketItem[];
  isTicketLoading: boolean;
  onOpenTicketHistory: () => void;
  inviteLinkDisplay: string;
  onCopyInviteLink: () => void | Promise<void>;
};

export function LiveYoutube({
  videoId,
  overlayEnabled,
  latestNumber,
  announcementEnabled = false,
  announcementContent = "",
  todayTotal,
  freeBetsCount,
  ticketItems,
  isTicketLoading,
  onOpenTicketHistory,
  inviteLinkDisplay,
  onCopyInviteLink,
}: Props) {
  const [wheelMode, setWheelMode] = useState(false);

  const src = useMemo(() => {
    if (!videoId) {
      return null;
    }
    const id = encodeURIComponent(videoId);
    return `https://www.youtube.com/embed/${id}?enablejsapi=1&autoplay=0&mute=1`;
  }, [videoId]);

  return (
    <section id="live-stage" className="live-hub">
      <div className="live-hub-grid">
        <aside className="live-hub-left">
          <section className="panel live-hub-chart-panel" aria-label="Mouse Historical Draw Time Distribution">
            <h3 className="live-hub-chart-title">
              <span className="section-star" aria-hidden="true">★</span>
              Mouse Historical Draw Time Distribution
            </h3>
            <img src="/bar_chart.png" alt="Mouse Historical Draw Time Distribution" className="live-hub-chart-image" />
          </section>

          <section id="invite-mission" className="panel invite-panel live-hub-invite-panel">
            <div className="invite-pill-row">
              <FreeBetsPill count={freeBetsCount} />
            </div>
            <h3>
              <span className="section-star" aria-hidden="true">★</span>
              Invite a Friend to Complete Task 3
            </h3>
            <p>Copy the link and send it to a friend. Each successful registration earns you one participation token！</p>
            <div className="invite-copy-col">
              <input type="text" readOnly value={inviteLinkDisplay} aria-label="Invite link" />
              <button type="button" className="invite-copy-btn" onClick={() => void onCopyInviteLink()} aria-label="Copy invite link">
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true" width="32" height="32">
                  <rect x="8" y="8" width="12" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8"/>
                  <path d="M6 15.5H5a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 5 3.5h9A1.5 1.5 0 0 1 15.5 5v1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          </section>
        </aside>

        <section className="panel live-hub-stage-bundle">
          <div className="live-hub-main">
            <h2 className="live-hub-draw-total">
              <span>This Mouse has Already Drawn</span>
              <span>{todayTotal} Numbers Today</span>
            </h2>

            <div className={`live-stage ${wheelMode ? "live-stage--wheel" : "live-stage--video"}`}>
              <div className="video-wrap">
                {wheelMode ? (
                  <div className="wheel-mode-stage">
                    <Wheel latestNumber={latestNumber} isSpinning={true} />
                  </div>
                ) : (
                  <>
                    {src ? (
                      <iframe
                        title="Hamster Spin Live"
                        src={src}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                      />
                    ) : (
                      <div className="video-skeleton" aria-live="polite" aria-label="Loading live video">
                        <div className="video-skeleton-top" />
                        <div className="video-skeleton-center" />
                        <div className="video-skeleton-bottom" />
                      </div>
                    )}
                    {overlayEnabled ? (
                      <div className="stage-overlay">
                        <p className="live-tag">(◉) LIVE</p>
                        <p className="stage-mouse">🐭</p>
                        <h2>Hamster Spin Draw Stream</h2>
                        <p>Watch the live draw in real-time</p>
                      </div>
                    ) : null}
                  </>
                )}

                {announcementEnabled ? (
                  <div className="live-announcement-overlay" role="dialog" aria-modal="true" aria-label="Site announcement">
                    <div className="live-announcement-card">
                      <p className="live-announcement-tag">Announcement</p>
                      <h3>Temporary Service Notice</h3>
                      <p className="live-announcement-body">
                        {announcementContent.trim() || "The game is temporarily paused. Please check back shortly."}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <FreeBetsPill count={freeBetsCount} className="live-hub-free-bets" />
          </div>

          <aside className="live-hub-sidebar">
            <div className="live-hub-toggle" role="tablist" aria-label="Live mode switch">
            <button
              type="button"
              role="tab"
              aria-selected={!wheelMode}
              className={`live-hub-toggle-btn ${!wheelMode ? "live-hub-toggle-btn-active" : ""}`}
              onClick={() => setWheelMode(false)}
              disabled={announcementEnabled}
            >
              Live
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={wheelMode}
              className={`live-hub-toggle-btn ${wheelMode ? "live-hub-toggle-btn-active" : ""}`}
              onClick={() => setWheelMode(true)}
              disabled={announcementEnabled}
            >
              Wheel Mode
            </button>
            </div>

            <section className="live-hub-tickets" aria-label="My active tickets">
              <h3>My Active Tickets</h3>
              <div className="live-hub-ticket-list">
                {isTicketLoading ? <small>Loading...</small> : null}
                {!isTicketLoading ? ticketItems.map((ticket, index) => (
                  <article key={ticket.id} className="live-hub-ticket-item">
                    <div className="live-hub-ticket-header">
                      <strong>Ticket{index + 1}</strong>
                      <span className="entry-status-pill live-hub-ticket-status">{ticket.status}</span>
                    </div>
                    <div className="entry-number-balls live-hub-ticket-balls" aria-label={ticket.numbers.join("-")}>
                      {ticket.numbers.map((number, numberIndex) => (
                        <span key={`${ticket.id}-${number}-${numberIndex}`} className="entry-number-ball">{number}</span>
                      ))}
                    </div>
                    <small className="live-hub-ticket-unmatched">{ticket.detailText}</small>
                  </article>
                )) : null}
                {!isTicketLoading && ticketItems.length === 0 ? <small>No tickets yet.</small> : null}
              </div>
              <button type="button" className="live-hub-active-btn" onClick={onOpenTicketHistory}>Active Tickets</button>
            </section>
          </aside>
        </section>
      </div>
    </section>
  );
}
