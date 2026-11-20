/* Generated layout: the case-study diagram "Patient flow today (as-is)". Colours come from tokens via the .dg-* classes in app/globals.css. */
export function AsIsFlow() {
  return (
    <svg viewBox="0 0 820 1000" className="dg" role="img" aria-labelledby="dg-as-is-title dg-as-is-desc"
         data-testid="diagram-svg" style={{ minWidth: 640 }}>
      <title id="dg-as-is-title">Patient flow today (as-is)</title>
      <desc id="dg-as-is-desc">Flowchart. An older resident with a health concern chooses where to seek care: a GP clinic (CHAS or CDMP), a polyclinic, or a public emergency department. Clinics may refer to the ED; this is still to be validated. At the ED: registration and triage, then an ED doctor, then a decision whether to admit. If not, the patient is discharged. If admitted, they wait in the ED for a ward bed, then exit the ED to an inpatient ward. Published measures: MOH counts every arrival as an ED visit; NUHS estimates patients waiting and the wait to see a doctor; MOH&apos;s bed wait runs from the decision to admit to leaving the ED, as a daily median.</desc>
      <defs>
      <marker id="dg-as-is-dg-head" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L8 4 L0 8 Z" className="dg-head" /></marker>
      <marker id="dg-as-is-dg-head-focal" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L8 4 L0 8 Z" className="dg-head-focal" /></marker>
      <marker id="dg-as-is-dg-head-soft" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L8 4 L0 8 Z" className="dg-head-soft" /></marker>
      </defs>
      <path d="M300 72 V96" className="dg-edge" markerEnd="url(#dg-as-is-dg-head)" />
      <path d="M192 144 H118 Q110 144 110 152 V240" className="dg-edge" markerEnd="url(#dg-as-is-dg-head)" />
      <path d="M300 192 V240" className="dg-edge" markerEnd="url(#dg-as-is-dg-head)" />
      <path d="M408 144 H472 Q480 144 480 152 V328" className="dg-edge" markerEnd="url(#dg-as-is-dg-head)" />
      <path d="M300 296 V336 Q300 344 308 344 H380" className="dg-edge dg-dash" markerEnd="url(#dg-as-is-dg-head)" />
      <path d="M110 296 V360 Q110 368 118 368 H380" className="dg-edge dg-dash" markerEnd="url(#dg-as-is-dg-head)" />
      <path d="M480 384 V432" className="dg-edge" markerEnd="url(#dg-as-is-dg-head)" />
      <path d="M480 488 V536" className="dg-edge" markerEnd="url(#dg-as-is-dg-head)" />
      <path d="M480 580 V620" className="dg-edge" markerEnd="url(#dg-as-is-dg-head)" />
      <path d="M388 664 H340" className="dg-edge" markerEnd="url(#dg-as-is-dg-head)" />
      <path d="M480 708 V760" className="dg-edge dg-focal-edge" markerEnd="url(#dg-as-is-dg-head-focal)" />
      <path d="M480 816 V868" className="dg-edge" markerEnd="url(#dg-as-is-dg-head)" />
      <path d="M580 356 H616" className="dg-edge dg-dot" markerEnd="url(#dg-as-is-dg-head-soft)" />
      <path d="M580 460 H616" className="dg-edge dg-dot" markerEnd="url(#dg-as-is-dg-head-soft)" />
      <path d="M580 788 H616" className="dg-edge dg-dot dg-focal-edge" markerEnd="url(#dg-as-is-dg-head-focal)" />
      <rect x="118" y="347" width="184" height="14" rx="2" className="dg-mask" />
      <text x="210" y="358" textAnchor="middle" className="dg-label">Referral (to validate)</text>
      <rect x="350" y="641" width="28" height="14" rx="2" className="dg-mask" />
      <text x="364" y="652" textAnchor="middle" className="dg-label">No</text>
      <rect x="484" y="727" width="184" height="14" rx="2" className="dg-mask" />
      <text x="488" y="738" textAnchor="start" className="dg-label">Yes: decision to admit</text>
      <rect x="484" y="835" width="106" height="14" rx="2" className="dg-mask" />
      <text x="488" y="846" textAnchor="start" className="dg-label">Exits the ED</text>
      <polygon points="300,96 408,144 300,192 192,144" className="dg-node" />
      <text x="300" y="139" textAnchor="middle" className="dg-name">Where do they</text>
      <text x="300" y="157" textAnchor="middle" className="dg-name">seek care?</text>
      <polygon points="480,620 572,664 480,708 388,664" className="dg-node" />
      <text x="480" y="668" textAnchor="middle" className="dg-name">Admit?</text>
      <rect x="210" y="24" width="180" height="48" rx="24" className="dg-end" />
      <text x="300" y="43" textAnchor="middle" className="dg-name">Older resident with</text>
      <text x="300" y="61" textAnchor="middle" className="dg-name">a health concern</text>
      <rect x="20" y="240" width="180" height="56" rx="6" className="dg-node" />
      <text x="110" y="263.5" textAnchor="middle" className="dg-name">GP clinic</text>
      <text x="110" y="281.5" textAnchor="middle" className="dg-sub">CHAS / CDMP</text>
      <rect x="210" y="240" width="180" height="56" rx="6" className="dg-node" />
      <text x="300" y="272" textAnchor="middle" className="dg-name">Polyclinic</text>
      <rect x="380" y="328" width="200" height="56" rx="6" className="dg-node" />
      <text x="480" y="351" textAnchor="middle" className="dg-name">Public emergency</text>
      <text x="480" y="369" textAnchor="middle" className="dg-name">department</text>
      <rect x="380" y="432" width="200" height="56" rx="6" className="dg-node" />
      <text x="480" y="455" textAnchor="middle" className="dg-name">Registration</text>
      <text x="480" y="473" textAnchor="middle" className="dg-name">and triage</text>
      <rect x="380" y="536" width="200" height="44" rx="6" className="dg-node" />
      <text x="480" y="562" textAnchor="middle" className="dg-name">Seen by an ED doctor</text>
      <rect x="180" y="640" width="160" height="48" rx="24" className="dg-end" />
      <text x="260" y="668" textAnchor="middle" className="dg-name">Discharged</text>
      <rect x="380" y="760" width="200" height="56" rx="6" className="dg-focal" />
      <text x="480" y="783" textAnchor="middle" className="dg-name">Waits in the ED</text>
      <text x="480" y="801" textAnchor="middle" className="dg-name">for a ward bed</text>
      <rect x="380" y="868" width="200" height="48" rx="24" className="dg-end" />
      <text x="480" y="896" textAnchor="middle" className="dg-name">Inpatient ward</text>
      <rect x="616" y="320" width="180" height="72" rx="6" className="dg-measure" />
      <text x="706" y="343" textAnchor="middle" className="dg-name">ED visits</text>
      <text x="706" y="361" textAnchor="middle" className="dg-sub">MOH: counted as</text>
      <text x="706" y="378" textAnchor="middle" className="dg-sub">an ED visit</text>
      <rect x="616" y="412" width="180" height="96" rx="6" className="dg-measure" />
      <text x="706" y="446.5" textAnchor="middle" className="dg-name">Patients waiting,</text>
      <text x="706" y="464.5" textAnchor="middle" className="dg-name">wait to see a doctor</text>
      <text x="706" y="482.5" textAnchor="middle" className="dg-sub">NUHS: estimate</text>
      <rect x="616" y="744" width="180" height="88" rx="6" className="dg-focal-measure" />
      <text x="706" y="775" textAnchor="middle" className="dg-name">Bed wait</text>
      <text x="706" y="793" textAnchor="middle" className="dg-sub">MOH: decision to admit</text>
      <text x="706" y="810" textAnchor="middle" className="dg-sub">to exit (daily median)</text>
      <path d="M20 940 H800" className="dg-rule" />
      <rect x="20" y="956" width="28" height="16" rx="8" className="dg-end" />
      <text x="56" y="968" textAnchor="start" className="dg-label">Start or end</text>
      <rect x="159" y="956" width="28" height="16" rx="3" className="dg-node" />
      <text x="195" y="968" textAnchor="start" className="dg-label">Step</text>
      <path d="M243 964 H271" className="dg-edge dg-dash" />
      <text x="279" y="968" textAnchor="start" className="dg-label">Referral, to validate</text>
      <rect x="444" y="956" width="28" height="16" rx="3" className="dg-measure" />
      <text x="480" y="968" textAnchor="start" className="dg-label">Published measure</text>
      <rect x="617" y="956" width="28" height="16" rx="3" className="dg-focal" />
      <text x="653" y="968" textAnchor="start" className="dg-label">What this site tracks</text>
    </svg>
  );
}
