"use client";

/* Nav - Primary mobile navigation (Figma 55:2138) */

const scrollToSection = (targetId: string) => {
  document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
};

function BetIcon() {
  return (
    <svg viewBox="0 0 90.563 90.563" fill="none" focusable="false" aria-hidden="true">
      <g stroke="#ffe89a" strokeWidth="5.43377" strokeLinecap="round" strokeLinejoin="round">
        <path
          transform="translate(10.865 10.865)"
          d="M34.4139 66.1109C51.9197 66.1109 66.1109 51.9197 66.1109 34.4139C66.1109 16.9081 51.9197 2.71689 34.4139 2.71689C16.9081 2.71689 2.71689 16.9081 2.71689 34.4139C2.71689 51.9197 16.9081 66.1109 34.4139 66.1109Z"
        />
        <path
          transform="translate(4.529 4.529)"
          d="M40.7533 2.71689V13.5844M40.7533 67.9222V78.7897M2.71689 40.7533H13.5844M67.9222 40.7533H78.7897M13.5844 13.5844L21.7351 21.7351M59.7715 59.7715L67.9222 67.9222M67.9222 13.5844L59.7715 21.7351M21.7351 59.7715L13.5844 67.9222"
        />
        <path
          transform="translate(12.676 12.676)"
          d="M22.6415 2.71763L26.264 12.6795M42.5653 52.5272L46.1878 62.4892M2.71763 42.5653L12.6795 38.9428M52.5272 26.264L62.4892 22.6415M2.71763 22.6415L12.6795 26.264M52.5272 38.9428L62.4892 42.5653M22.6415 62.4892L26.264 52.5272M42.5653 12.6795L46.1878 2.71763"
        />
        <path
          transform="translate(23.547 23.547)"
          d="M21.7351 40.7533C32.2386 40.7533 40.7533 32.2386 40.7533 21.7351C40.7533 11.2316 32.2386 2.71689 21.7351 2.71689C11.2316 2.71689 2.71689 11.2316 2.71689 21.7351C2.71689 32.2386 11.2316 40.7533 21.7351 40.7533Z"
        />
      </g>
    </svg>
  );
}

function LiveIcon() {
  return (
    <svg viewBox="0 0 87.576 87.576" fill="none" focusable="false" aria-hidden="true">
      <g stroke="#ffe89a" strokeWidth="5.25457" strokeLinecap="round" strokeLinejoin="round">
        <path
          transform="translate(8.76 8.76)"
          d="M35.0304 67.4336C52.9262 67.4336 67.4336 52.9262 67.4336 35.0304C67.4336 17.1347 52.9262 2.62728 35.0304 2.62728C17.1347 2.62728 2.62728 17.1347 2.62728 35.0304C2.62728 52.9262 17.1347 67.4336 35.0304 67.4336Z"
        />
        <path
          transform="translate(34.155 27.147)"
          d="M2.62728 2.62729L24.5213 16.6395L2.62728 30.6516V2.62729Z"
        />
      </g>
    </svg>
  );
}

function InviteIcon() {
  return (
    <svg viewBox="0 0 85.683 85.683" fill="none" focusable="false" aria-hidden="true">
      <g stroke="#ffe997" strokeWidth="5.14097" strokeLinecap="round" strokeLinejoin="round">
        <path
          transform="translate(19.706 11.994)"
          d="M16.2798 29.989C23.8512 29.989 29.989 23.8512 29.989 16.2798C29.989 8.70833 23.8512 2.57049 16.2798 2.57049C8.70833 2.57049 2.57049 8.70833 2.57049 16.2798C2.57049 23.8512 8.70833 29.989 16.2798 29.989Z"
        />
        <path
          transform="translate(11.141 28.276)"
          d="M55.6939 2.57049V23.9912M45.412 13.2809H65.9759M2.57049 41.9846C3.42732 26.5617 11.9956 18.8502 24.8481 18.8502C37.7005 18.8502 46.2688 26.5617 47.1256 41.9846H2.57049Z"
        />
      </g>
    </svg>
  );
}

export function MobileNav() {
  return (
    <nav className="mobile-nav" aria-label="Jump to section">
      <button
        type="button"
        className="mobile-nav-link"
        onClick={() => scrollToSection("select-numbers")}
      >
        <span className="mobile-nav-icon mobile-nav-icon-bet">
          <BetIcon />
        </span>
        <span className="mobile-nav-label">Bet</span>
      </button>

      <button
        type="button"
        className="mobile-nav-link"
        onClick={() => scrollToSection("live-stage")}
      >
        <span className="mobile-nav-icon mobile-nav-icon-live">
          <LiveIcon />
        </span>
        <span className="mobile-nav-label">Live</span>
      </button>

      <button
        type="button"
        className="mobile-nav-link"
        onClick={() => scrollToSection("daily-missions")}
      >
        <span className="mobile-nav-icon">
          <span className="mobile-nav-star" aria-hidden="true">★</span>
        </span>
        <span className="mobile-nav-label">Missions</span>
      </button>

      <button
        type="button"
        className="mobile-nav-link mobile-nav-link-invite"
        onClick={() => scrollToSection("invite-mission")}
      >
        <span className="mobile-nav-icon mobile-nav-icon-invite">
          <InviteIcon />
        </span>
        <span className="mobile-nav-label">Invite</span>
      </button>
    </nav>
  );
}
