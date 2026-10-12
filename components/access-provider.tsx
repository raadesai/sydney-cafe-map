"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { isRater, RATER_COLORS, RATER_NAMES, RATER_ORDER, type Rater } from "@/data/raters";

// First-visit gate. The password unlocks editing and photos; "View only"
// browses the map without either. Edit devices then pick whose device this
// is (once), so ratings land under the right person. Both choices are
// remembered per device.
const MODE_KEY = "access-mode";
const PASSWORD_KEY = "access-password";
const RATER_KEY = "access-rater";

type AccessMode = "edit" | "view";

type AccessContextValue = {
  /** null until the stored choice is read, or when the gate is open. */
  mode: AccessMode | null;
  canEdit: boolean;
  /** Whose device this is; null on view-only devices or before the pick. */
  rater: Rater | null;
  /** Headers to attach to password-protected requests. */
  authHeaders: () => Record<string, string>;
  /** Reopens the gate so a view-only device can enter the password. */
  reopenGate: () => void;
};

const AccessContext = createContext<AccessContextValue | null>(null);

export function useAccess(): AccessContextValue {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error("useAccess must be used inside AccessProvider");
  return ctx;
}

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<AccessMode | null>(null);
  const [rater, setRater] = useState<Rater | null>(null);
  const [gateOpen, setGateOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(MODE_KEY);
    if (stored === "edit" || stored === "view") setMode(stored);
    else setGateOpen(true);
    const storedRater = localStorage.getItem(RATER_KEY);
    if (isRater(storedRater)) setRater(storedRater);
  }, []);

  const authHeaders = useCallback((): Record<string, string> => {
    const password = localStorage.getItem(PASSWORD_KEY);
    return password ? { Authorization: `Bearer ${password}` } : {};
  }, []);

  const reopenGate = useCallback(() => setGateOpen(true), []);

  const choose = useCallback((next: AccessMode, password?: string) => {
    localStorage.setItem(MODE_KEY, next);
    if (password) localStorage.setItem(PASSWORD_KEY, password);
    setMode(next);
    setGateOpen(false);
  }, []);

  const chooseRater = useCallback((next: Rater) => {
    localStorage.setItem(RATER_KEY, next);
    setRater(next);
  }, []);

  return (
    <AccessContext.Provider
      value={{ mode, canEdit: mode === "edit", rater, authHeaders, reopenGate }}
    >
      {children}
      {gateOpen && <AccessGate onChoose={choose} />}
      {!gateOpen && mode === "edit" && !rater && <RaterGate onChoose={chooseRater} />}
    </AccessContext.Provider>
  );
}

// One-time "whose device is this?" pick for edit devices, so ratings land
// under the right person.
function RaterGate({ onChoose }: { onChoose: (rater: Rater) => void }) {
  return (
    <div
      className="fixed inset-0 z-[2000] bg-[#1C1512] flex items-center justify-center p-6"
      role="dialog"
      aria-label="Who are you?"
    >
      <div className="w-full max-w-xs flex flex-col gap-4">
        <div className="text-center mb-1">
          <h1 className="text-[21px] font-bold text-[#F7F2EA] m-0 mb-1">
            Who&apos;s this?
          </h1>
          <p className="text-[13px] text-[#F7F2EA]/50 m-0">
            Ratings from this device count as yours
          </p>
        </div>

        {RATER_ORDER.map((person) => (
          <button
            key={person}
            type="button"
            onClick={() => onChoose(person)}
            style={{ borderColor: `${RATER_COLORS[person]}66` }}
            className={cn(
              "w-full py-3.5 rounded-xl text-[15px] font-bold flex items-center justify-center gap-2.5",
              "border bg-[rgba(247,242,234,0.04)] text-[#F7F2EA]",
              "hover:bg-[rgba(247,242,234,0.08)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8834A]/60",
            )}
          >
            <span
              className="flex items-center justify-center w-7 h-7 rounded-full text-[13px] font-bold text-[#1C1512]"
              style={{ backgroundColor: RATER_COLORS[person] }}
              aria-hidden="true"
            >
              {person}
            </span>
            {RATER_NAMES[person]}
          </button>
        ))}
      </div>
    </div>
  );
}

function AccessGate({ onChoose }: { onChoose: (mode: AccessMode, password?: string) => void }) {
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.SubmitEvent) {
    e.preventDefault();
    const entered = password.trim().toUpperCase();
    if (!entered || checking) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: entered }),
      });
      if (!res.ok) {
        setError(res.status === 401 ? "Wrong password — try again" : "Something went wrong — try again");
        return;
      }
      onChoose("edit", entered);
    } catch {
      setError("Network error — check your connection");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[2000] bg-[#1C1512] flex items-center justify-center p-6"
      role="dialog"
      aria-label="Password"
    >
      <form onSubmit={submit} className="w-full max-w-xs flex flex-col gap-4">
        <div className="text-center mb-1">
          <h1 className="text-[21px] font-bold text-[#F7F2EA] m-0 mb-1">
            Sydney <span className="text-[#B8834A]">Cafe Map</span>
          </h1>
          <p className="text-[13px] text-[#F7F2EA]/50 m-0">
            Enter the password to edit and see photos
          </p>
        </div>

        <input
          type="password"
          autoComplete="off"
          autoCapitalize="characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          aria-label="Password"
          className={cn(
            "w-full rounded-xl border border-[rgba(247,242,234,0.15)] bg-[rgba(247,242,234,0.05)]",
            "px-4 py-3 text-[15px] text-center tracking-[0.2em] text-[#F7F2EA] placeholder:tracking-normal placeholder:text-[#F7F2EA]/30",
            "focus:outline-none focus:ring-2 focus:ring-[#B8834A]/60 focus:border-transparent",
          )}
        />

        {error && (
          <p className="text-[12.5px] text-[#C4735A] text-center m-0" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!password.trim() || checking}
          className={cn(
            "w-full py-3 rounded-xl text-[15px] font-bold",
            "bg-[#B8834A] text-[#1C1512]",
            "hover:bg-[#c99458] active:bg-[#a57440]",
            "disabled:opacity-40 disabled:pointer-events-none",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8834A]/60",
          )}
        >
          {checking ? "Checking…" : "Unlock"}
        </button>

        <button
          type="button"
          onClick={() => onChoose("view")}
          className={cn(
            "w-full py-3 rounded-xl text-[13.5px] font-semibold",
            "border border-[rgba(247,242,234,0.2)] text-[#F7F2EA]/70",
            "hover:bg-[rgba(247,242,234,0.06)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8834A]/60",
          )}
        >
          View only
        </button>
      </form>
    </div>
  );
}
