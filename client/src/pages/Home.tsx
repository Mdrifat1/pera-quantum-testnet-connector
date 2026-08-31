import { useEffect, useMemo, useRef, useState } from "react";
import { PeraWalletConnect } from "@perawallet/connect";
import algosdk, { Transaction } from "algosdk";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleHelp,
  Copy,
  ExternalLink,
  Fingerprint,
  Gauge,
  Link2,
  LockKeyhole,
  LogOut,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  WalletCards,
  X,
  Zap,
} from "lucide-react";

const peraWallet = new PeraWalletConnect({
  chainId: 4160,
  shouldShowSignTxnToast: true,
});

const ALGOD_URLS = {
  testnet: "https://testnet-api.algonode.cloud",
  mainnet: "https://mainnet-api.algonode.cloud",
} as const;
const MIN_MICRO_ALGO = 100;
const MAX_MICRO_ALGO = 3000;
const DEFAULT_INTERVAL = 60;
const AUTO_SESSION_CAP = 40;

type Activity = {
  id: string;
  label: string;
  detail: string;
  tone: "neutral" | "success" | "danger";
};

type Draft = {
  txn: Transaction;
  amountMicro: number;
  recipient: string;
};

function shortAddress(address: string) {
  return `${address.slice(0, 7)}…${address.slice(-7)}`;
}

function formatAlgo(microAlgo: number) {
  return (microAlgo / 1_000_000).toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function makeActivity(label: string, detail: string, tone: Activity["tone"] = "neutral"): Activity {
  return { id: `${Date.now()}-${Math.random()}`, label, detail, tone };
}

export default function Home() {
  const [network, setNetwork] = useState<"testnet" | "mainnet">("testnet");
  const [mainnetAcknowledged, setMainnetAcknowledged] = useState(false);
  const algod = useMemo(() => new algosdk.Algodv2("", ALGOD_URLS[network], ""), [network]);
  const [accountAddress, setAccountAddress] = useState<string | null>(null);
  const [recipient, setRecipient] = useState("");
  const [intervalSeconds, setIntervalSeconds] = useState(DEFAULT_INTERVAL);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [balanceMicro, setBalanceMicro] = useState<number | null>(null);
  const [activities, setActivities] = useState<Activity[]>([
    makeActivity("Ready for a wallet session", "TestNet only · approvals stay in Pera"),
  ]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [autoQueue, setAutoQueue] = useState(false);
  const [autoRequest, setAutoRequest] = useState(false);
  const [autoRequestsUsed, setAutoRequestsUsed] = useState(0);
  const [nextReviewIn, setNextReviewIn] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ kind: "info" | "error" | "success"; text: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoQueueRef = useRef(false);
  const autoRequestRef = useRef(false);
  const autoRequestsUsedRef = useRef(0);

  const pushActivity = (activity: Activity) => {
    setActivities((current) => [activity, ...current].slice(0, 5));
  };

  const refreshBalance = async (address: string) => {
    try {
      const account = await algod.accountInformation(address).do();
      setBalanceMicro(Number(account.amount ?? 0));
    } catch {
      setBalanceMicro(null);
    }
  };

  const handleDisconnect = () => {
    void peraWallet.disconnect();
    if (timerRef.current) clearTimeout(timerRef.current);
    autoQueueRef.current = false;
    autoRequestRef.current = false;
    setAccountAddress(null);
    setDraft(null);
    setBalanceMicro(null);
    setAutoQueue(false);
    setAutoRequest(false);
    setAutoRequestsUsed(0);
    setNextReviewIn(null);
    setNotice({ kind: "info", text: "Pera session disconnected." });
    pushActivity(makeActivity("Disconnected", "The wallet session was closed"));
  };

  useEffect(() => {
    const reconnect = async () => {
      try {
        const accounts = await peraWallet.reconnectSession();
        if (accounts.length) {
          setAccountAddress(accounts[0]);
          await refreshBalance(accounts[0]);
          pushActivity(makeActivity("Session restored", `Pera · ${shortAddress(accounts[0])}`, "success"));
        }
      } catch {
        // A missing or expired session is expected on a first visit.
      }
    };
    void reconnect();
    peraWallet.connector?.on("disconnect", handleDisconnect);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (network === "mainnet" && intervalSeconds < 3) setIntervalSeconds(3);
  }, [network, intervalSeconds]);

  const handleConnect = async () => {
    setIsConnecting(true);
    setNotice(null);
    try {
      const accounts = await peraWallet.connect();
      const address = accounts[0];
      setAccountAddress(address);
      await refreshBalance(address);
      setNotice({ kind: "success", text: "Connected. Confirm that Pera selected your Quantum Account before approving." });
      pushActivity(makeActivity("Pera account connected", `Confirm Quantum selection in Pera · ${shortAddress(address)}`, "success"));
    } catch (error) {
      const code = (error as { data?: { type?: string } })?.data?.type;
      if (code !== "CONNECT_MODAL_CLOSED") {
        setNotice({ kind: "error", text: "Pera could not connect. Try again from the wallet app." });
        pushActivity(makeActivity("Connection failed", "No transaction was created", "danger"));
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const validateRecipient = () => {
    const value = recipient.trim();
    if (!algosdk.isValidAddress(value)) {
      setNotice({ kind: "error", text: "Enter a valid 58-character Algorand address." });
      return null;
    }
    return value;
  };

  const prepareTransfer = async () => {
    if (!accountAddress) {
      setNotice({ kind: "error", text: "Connect Pera first." });
      return;
    }
    const receiver = validateRecipient();
    if (!receiver) return;
    if (network === "mainnet" && !mainnetAcknowledged) {
      setNotice({ kind: "error", text: "Acknowledge the MainNet warning before creating a real-ALGO draft." });
      return;
    }

    setIsPreparing(true);
    setNotice(null);
    try {
      const suggestedParams = await algod.getTransactionParams().do();
      const amountMicro = Math.floor(
        Math.random() * (MAX_MICRO_ALGO - MIN_MICRO_ALGO + 1) + MIN_MICRO_ALGO,
      );
      const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: accountAddress,
        receiver,
        amount: amountMicro,
        suggestedParams,
        note: new TextEncoder().encode(`Pera Quantum ${network} approval demo`),
      });
      setDraft({ txn, amountMicro, recipient: receiver });
      setNotice({ kind: "info", text: "Draft ready. Review every detail, then open Pera to approve." });
      pushActivity(makeActivity("Draft prepared", `${formatAlgo(amountMicro)} ALGO · awaiting your approval`));
    } catch {
      setNotice({ kind: "error", text: "Could not fetch TestNet parameters. Check your connection and retry." });
      pushActivity(makeActivity("Draft failed", "No transaction was sent", "danger"));
    } finally {
      setIsPreparing(false);
    }
  };

  const scheduleNextReview = () => {
    if (!autoRequestRef.current || !accountAddress || autoRequestsUsedRef.current >= AUTO_SESSION_CAP) return;
    setNextReviewIn(intervalSeconds);
    let remaining = intervalSeconds;
    const tick = () => {
      remaining -= 1;
      setNextReviewIn(remaining > 0 ? remaining : null);
      if (remaining > 0) {
        timerRef.current = setTimeout(tick, 1000);
      } else if (autoRequestRef.current) {
        void prepareTransfer();
      }
    };
    timerRef.current = setTimeout(tick, 1000);
  };

  const stopAutoRequests = () => {
    autoRequestRef.current = false;
    autoQueueRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    setNextReviewIn(null);
    setAutoRequest(false);
    setAutoQueue(false);
    pushActivity(makeActivity("Auto-request stopped", "No new Pera request will be created"));
    setNotice({ kind: "info", text: "Stopped. Any request already open in Pera must be handled there." });
  };

  const startAutoRequests = async () => {
    if (!accountAddress) {
      setNotice({ kind: "error", text: "Connect Pera first." });
      return;
    }
    if (network === "mainnet" && !mainnetAcknowledged) {
      setNotice({ kind: "error", text: "Acknowledge the MainNet warning before starting auto-request mode." });
      return;
    }
    if (!validateRecipient()) return;
    autoRequestsUsedRef.current = 0;
    autoRequestRef.current = true;
    autoQueueRef.current = true;
    setAutoRequestsUsed(0);
    setAutoRequest(true);
    setAutoQueue(true);
    setNotice({ kind: "info", text: "Auto-request started. Approve or reject each request in Pera; Stop blocks future requests." });
    pushActivity(makeActivity("Auto-request started", `Up to ${AUTO_SESSION_CAP} manual approvals · ${network}`));
    await prepareTransfer();
  };

  const approveAndSend = async () => {
    if (!accountAddress || !draft) return;
    setIsSigning(true);
    setNotice({ kind: "info", text: `Pera is opening. Review the recipient, amount, and ${network} network there.` });
    try {
      const signedTxnGroup = await peraWallet.signTransaction([
        [{ txn: draft.txn, signers: [accountAddress] }],
      ]);
      const { txid } = await algod.sendRawTransaction(signedTxnGroup).do();
      autoRequestsUsedRef.current += 1;
      setAutoRequestsUsed(autoRequestsUsedRef.current);
      setNotice({ kind: "success", text: `Approved and submitted to Algorand ${network}.` });
      pushActivity(makeActivity("Submitted", `${formatAlgo(draft.amountMicro)} ALGO · ${txid.slice(0, 12)}…`, "success"));
      setDraft(null);
      await refreshBalance(accountAddress);
      if (autoRequestRef.current && autoRequestsUsedRef.current < AUTO_SESSION_CAP) scheduleNextReview();
      else if (autoRequestRef.current) stopAutoRequests();
    } catch (error) {
      const message = String(error).toLowerCase();
      const cancelled = message.includes("reject") || message.includes("cancel") || message.includes("close");
      setNotice({ kind: cancelled ? "info" : "error", text: cancelled ? "Approval cancelled. Nothing was sent." : "The signed transaction was not submitted." });
      pushActivity(makeActivity(cancelled ? "Approval cancelled" : "Submission failed", "No funds were sent", cancelled ? "neutral" : "danger"));
      if (autoRequestRef.current) stopAutoRequests();
    } finally {
      setIsSigning(false);
    }
  };

  useEffect(() => {
    if (autoRequest && draft && !isSigning) void approveAndSend();
  }, [autoRequest, draft, isSigning]);

  const isConnected = Boolean(accountAddress);
  const isBusy = isConnecting || isPreparing || isSigning;

  return (
    <main className="min-h-screen overflow-hidden bg-[#07131b] text-[#eef5f2]">
      <div className="pointer-events-none fixed inset-0 opacity-80">
        <div className="orb orb-teal" />
        <div className="orb orb-amber" />
        <div className="grid-glow" />
      </div>

      <div className="relative mx-auto max-w-[1440px] px-5 pb-12 pt-5 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between border-b border-white/10 pb-5">
          <div className="flex items-center gap-3">
            <div className="brand-mark"><Sparkles size={18} strokeWidth={2.5} /></div>
            <div>
              <p className="eyebrow">PERA CONNECT / LAB 01</p>
              <p className="font-display text-lg font-semibold tracking-tight text-white">Quantum Relay</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`network-pill ${network === "mainnet" ? "mainnet-pill" : ""}`}><span className={network === "mainnet" ? "amber-dot" : "live-dot"} /> Algorand {network === "mainnet" ? "MainNet" : "TestNet"}</span>
            <a className="icon-link hidden sm:flex" href="https://docs.perawallet.app/references/pera-connect/" target="_blank" rel="noreferrer" aria-label="Open Pera Connect docs">
              <CircleHelp size={17} />
            </a>
          </div>
        </header>

        <section className="grid gap-12 pb-12 pt-14 lg:grid-cols-[1.02fr_.98fr] lg:items-end lg:pt-20">
          <div className="max-w-2xl">
            <div className="eyebrow mb-5 flex items-center gap-2 text-[#55d6c0]"><Zap size={14} /> HUMAN-APPROVED TRANSFERS</div>
            <h1 className="font-display text-[clamp(3.1rem,7vw,6.8rem)] font-medium leading-[.9] tracking-[-.065em] text-white">
              Quantum safety,<br /><span className="text-mint">with a human</span><br />in the loop.
            </h1>
            <p className="mt-8 max-w-lg text-lg leading-8 text-[#a4b6b6]">
              Connect Pera, choose the Quantum Account inside the wallet, and approve each transfer yourself. TestNet is the default; MainNet is available only behind a deliberate manual-approval gate.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <button className="primary-btn" onClick={isConnected ? handleDisconnect : handleConnect} disabled={isBusy}>
                {isConnected ? <><LogOut size={17} /> Disconnect Pera</> : <><WalletCards size={17} /> {isConnecting ? "Connecting…" : "Connect Pera Wallet"}</>}
              </button>
              <span className="microcopy"><LockKeyhole size={14} /> non-custodial signing</span>
            </div>
          </div>

          <div className="hero-card">
            <div className="hero-card-top"><span className="eyebrow text-[#6c8686]">SESSION SIGNAL</span><span className="status-chip"><span className="live-dot" /> {isConnected ? "CONNECTED" : "WAITING"}</span></div>
            <div className="signal-ring">
              <div className="signal-core"><Fingerprint size={35} strokeWidth={1.4} /><span>{isConnected ? "Pera" : "Secure"}</span></div>
            </div>
            <div className="hero-card-bottom">
              <div><span className="stat-label">SIGNER</span><strong>{accountAddress ? shortAddress(accountAddress) : "Not connected"}</strong></div>
              <div><span className="stat-label">BALANCE</span><strong>{balanceMicro === null ? "—" : `${formatAlgo(balanceMicro)} ALGO`}</strong></div>
              <ShieldCheck className="text-[#55d6c0]" size={23} />
            </div>
          </div>
        </section>

        {notice && (
          <div className={`notice notice-${notice.kind}`} role="status">
            {notice.kind === "success" ? <Check size={17} /> : notice.kind === "error" ? <X size={17} /> : <Gauge size={17} />}
            <span>{notice.text}</span>
          </div>
        )}

        <section className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
          <div className="panel panel-main">
            <div className="panel-heading">
              <div><p className="eyebrow text-[#55d6c0]">01 / TRANSFER DESIGNER</p><h2>Prepare a TestNet payment</h2></div>
              <div className="step-number">01</div>
            </div>
            <div className="network-switch" role="group" aria-label="Choose network">
              <button className={network === "testnet" ? "network-choice active" : "network-choice"} onClick={() => { setNetwork("testnet"); setMainnetAcknowledged(false); }}><span className="live-dot" /> TestNet <small>recommended</small></button>
              <button className={network === "mainnet" ? "network-choice mainnet-choice active" : "network-choice"} onClick={() => setNetwork("mainnet")}><span className="amber-dot" /> MainNet <small>guarded</small></button>
            </div>
            {network === "mainnet" && <label className="risk-check"><input type="checkbox" checked={mainnetAcknowledged} onChange={(event) => setMainnetAcknowledged(event.target.checked)} /><span>I understand this uses real ALGO and every transfer must be reviewed in Pera.</span></label>}
            <div className="field-block">
              <label htmlFor="recipient">Recipient address <span>· your other account</span></label>
              <div className="input-shell"><Link2 size={18} /><input id="recipient" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Paste a 58-character Algorand address" spellCheck={false} /><button className="copy-btn" onClick={() => navigator.clipboard?.readText().then(setRecipient)} title="Paste from clipboard"><Copy size={16} /></button></div>
              <p className="field-help">Only the public address is used. The account selector stays inside Pera.</p>
            </div>
            <div className="control-row">
              <div className="range-field"><label htmlFor="interval">Review interval <span>· after each approval</span></label><div className="range-wrap"><input id="interval" type="range" min={network === "mainnet" ? 3 : 1} max="300" step="1" value={intervalSeconds} onChange={(event) => setIntervalSeconds(Math.max(network === "mainnet" ? 3 : 1, Number(event.target.value)))} /><span>{intervalSeconds}s</span></div></div>
              <div className="amount-lock"><span className="stat-label">RANDOM RANGE</span><strong>0.0001 — 0.003</strong><small>ALGO / TestNet</small></div>
            </div>
            <div className="action-row">
              <button className="primary-btn" onClick={prepareTransfer} disabled={!isConnected || isBusy}>{isPreparing ? <RefreshCw className="spin" size={17} /> : <ArrowUpRight size={17} />} {isPreparing ? "Fetching params…" : "Generate review draft"}</button>
              {!isConnected && <span className="action-hint">Connect Pera to unlock</span>}
            </div>
          </div>

          <div className="panel panel-side">
            <div className="panel-heading"><div><p className="eyebrow text-[#e8b574]">02 / WALLET GATE</p><h2>Approve in Pera</h2></div><div className="step-number amber">02</div></div>
            {draft ? (
              <div className="draft-card">
                <div className="draft-top"><span className="status-chip amber-chip"><span className="amber-dot" /> READY TO REVIEW</span><span className="draft-network">{network.toUpperCase()}</span></div>
                <div className="draft-amount">{formatAlgo(draft.amountMicro)} <span>ALGO</span></div>
                <div className="draft-meta"><div><span>FROM</span><strong>{accountAddress ? shortAddress(accountAddress) : "—"}</strong></div><ChevronRight size={16} /><div><span>TO</span><strong>{shortAddress(draft.recipient)}</strong></div></div>
                <button className="approve-btn" onClick={approveAndSend} disabled={isSigning}>{isSigning ? <><RefreshCw className="spin" size={17} /> Waiting for Pera…</> : <><Fingerprint size={17} /> Open Pera to approve</>}</button>
                <button className="text-btn" onClick={() => { setDraft(null); setNotice({ kind: "info", text: "Draft discarded. No transaction was signed." }); }}>Discard draft</button>
              </div>
            ) : (
              <div className="empty-state"><div className="empty-icon"><LockKeyhole size={24} /></div><h3>Your approval is the switch</h3><p>Generate a draft to see the exact amount and recipient before Pera opens.</p><div className="mini-steps"><span><b>1</b> Draft</span><ChevronRight size={14} /><span><b>2</b> Review</span><ChevronRight size={14} /><span><b>3</b> Sign</span></div></div>
            )}
            <div className="auto-row"><div><strong>Automatic Pera requests</strong><span>{autoRequest ? `${autoRequestsUsed}/${AUTO_SESSION_CAP} requests · approve in Pera` : "Starts a capped manual-approval session"}</span></div>{autoRequest ? <button className="stop-btn" onClick={stopAutoRequests}><span /> Stop</button> : <button className="start-btn" onClick={startAutoRequests} disabled={isBusy || !isConnected}><Play size={13} /> Start</button>}</div>
            {nextReviewIn !== null && <p className="countdown"><RefreshCw size={13} /> Next draft in {nextReviewIn}s</p>}
          </div>
        </section>

        <section className="lower-grid">
          <div className="panel activity-panel"><div className="panel-heading compact"><div><p className="eyebrow text-[#55d6c0]">LIVE TRACE</p><h2>Session activity</h2></div><span className="trace-label">LOCAL ONLY</span></div><div className="activity-list">{activities.map((activity) => <div className="activity-item" key={activity.id}><span className={`activity-dot ${activity.tone}`} /><div><strong>{activity.label}</strong><span>{activity.detail}</span></div></div>)}</div></div>
          <div className="panel guard-panel"><div className="guard-icon"><ShieldCheck size={23} /></div><div><p className="eyebrow text-[#55d6c0]">SAFETY CONTRACT</p><h2>{network === "mainnet" ? "MainNet, by deliberate choice" : "TestNet by default"}</h2><p>This dApp cannot read your phrase, export keys, or approve a transaction without your action in Pera. MainNet requires an explicit acknowledgement and remains manually reviewed.</p><a href={network === "mainnet" ? "https://lora.algokit.io/mainnet" : "https://lora.algokit.io/testnet"} target="_blank" rel="noreferrer">View {network === "mainnet" ? "MainNet" : "TestNet"} explorer <ExternalLink size={14} /></a></div></div>
        </section>

        <footer className="mt-10 flex flex-col justify-between gap-3 border-t border-white/10 pt-5 text-xs text-[#718585] sm:flex-row"><span>Built for deliberate experimentation · FALCON / Pera Connect</span><span className="flex items-center gap-1.5"><span className="live-dot" /> Nothing signs without you</span></footer>
      </div>
    </main>
  );
}
