interface TastingModeCardProps {
  number: string;
  title: string;
  description: string;
}

/** One entry in the "Three ways to taste" section — a numeral, a fine rule, then title/description. */
export function TastingModeCard({ number, title, description }: TastingModeCardProps) {
  return (
    <div className="flex flex-col gap-3 px-2 py-5 sm:px-4 sm:py-0">
      <span className="font-display text-4xl text-landing-gold sm:text-5xl" aria-hidden="true">
        {number}
      </span>
      <span className="block h-px w-10 bg-landing-stone" aria-hidden="true" />
      <h3 className="font-display text-2xl font-semibold text-landing-plum">{title}</h3>
      <p className="text-sm leading-relaxed text-landing-warmgrey sm:text-base">{description}</p>
    </div>
  );
}
