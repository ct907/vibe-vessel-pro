export function OnboardingFilters() {
  return (
    <>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <filter id="onb-paper-noise" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="4" />
            <feDisplacementMap in="SourceGraphic" scale="2" />
          </filter>
        </defs>
      </svg>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          {([0, 5] as const).map((seed, i) => (
            <filter key={seed} id={`onb-squiggly-${i}`} x="-20%" y="-20%" width="140%" height="140%">
              <feTurbulence baseFrequency="0.02" numOctaves="3" result="noise" seed={seed} />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.8" />
            </filter>
          ))}
        </defs>
      </svg>
    </>
  );
}
