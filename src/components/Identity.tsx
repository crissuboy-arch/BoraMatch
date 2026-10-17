import { Heart } from "lucide-react";
export function Brand() {
  return (
    <span className="brand">
      <span className="brand-icon">
        <Heart size={19} fill="currentColor" />
      </span>
      Bora<span>Match</span>
    </span>
  );
}
export function Portrait({ n = 0 }: { n?: number }) {
  return (
    <div className={"portrait art-" + (n % 3)}>
      <svg
        viewBox="0 0 400 520"
        role="img"
        aria-label="Personagem fictício ilustrado"
      >
        <circle cx="320" cy="90" r="100" fill="white" opacity=".15" />
        <path
          d="M0 400Q80 330 150 370T400 310V520H0"
          fill="white"
          opacity=".15"
        />
        <path
          d="M55 520q5-174 145-174t145 174"
          fill={n % 2 ? "#243d4c" : "#954b60"}
        />
        <path d="M171 304h61v69q-30 30-61 0" fill="#ba805f" />
        <ellipse
          cx="200"
          cy="223"
          rx="80"
          ry="104"
          fill={n % 2 ? "#bd8361" : "#dfa980"}
        />
        <path
          d="M119 232q-20-128 70-140 111-9 100 150l-27-67q-62 20-108-10z"
          fill="#302b30"
        />
        {n % 2 === 0 && (
          <path
            d="M126 192q-40 100 0 176l30-25-12-150m120-4q46 90 9 173l-29-23 14-146"
            fill="#302b30"
          />
        )}
        <path
          d="M165 225h13m45 0h13"
          stroke="#513c34"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <path
          d="M187 275q15 12 30 0"
          stroke="#8d5146"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
