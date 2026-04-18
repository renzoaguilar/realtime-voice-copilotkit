"use client";

type VoiceModeToggleProps = {
  isActive: boolean;
  isBusy: boolean;
  onToggle: () => void;
};

export const VoiceModeToggle = ({
  isActive,
  isBusy,
  onToggle,
}: VoiceModeToggleProps) => {
  return (
    <button
      type="button"
      className={`voice-toggle ${isActive ? "is-active" : ""}`}
      onClick={onToggle}
      disabled={isBusy}
      aria-pressed={isActive}
    >
      {isBusy ? "Conectando..." : isActive ? "Desactivar voz" : "Activar voz"}
    </button>
  );
};
