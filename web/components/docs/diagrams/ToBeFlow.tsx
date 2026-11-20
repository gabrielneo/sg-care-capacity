/* Generated layout: the case-study diagram "Patient flow as official guidance describes it (to-be)". Colours come from tokens via the .dg-* classes in app/globals.css. */
export function ToBeFlow() {
  return (
    <svg viewBox="0 0 820 1020" className="dg" role="img" aria-labelledby="dg-to-be-title dg-to-be-desc"
         data-testid="diagram-svg" style={{ minWidth: 640 }}>
      <title id="dg-to-be-title">Patient flow as official guidance describes it (to-be)</title>
      <desc id="dg-to-be-desc">Flowchart. An older resident with a health concern asks: is it life-threatening? If yes, call 995 for an SCDF ambulance. If not sure, call the NurseFirst helpline for advice on where to go, which leads to a family doctor or to 995. If no, see a family doctor (a Healthier SG GP clinic) or a polyclinic, who refers to a public emergency department when hospital care is needed. SCDF takes patients to a public ED; since October 2025 eligible non-life-threatening cases can go to the Alexandra Hospital Urgent Care Centre instead. At the ED: triage, then an ED doctor, then a decision whether to admit. If not, the patient is discharged. If admitted, they wait in the ED for a ward bed, then go to an inpatient ward; patients who are medically stable and awaiting long-term care can move to a transitional care facility. What this site measures: CDMP clinics per senior by area (the Access Map), each ED&apos;s bed wait against its usual level (ED Trends and the findings), and MOH&apos;s count of ED visits.</desc>
      <defs>
      <marker id="dg-to-be-dg-head" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L8 4 L0 8 Z" className="dg-head" /></marker>
      <marker id="dg-to-be-dg-head-focal" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L8 4 L0 8 Z" className="dg-head-focal" /></marker>
      <marker id="dg-to-be-dg-head-soft" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L8 4 L0 8 Z" className="dg-head-soft" /></marker>
      </defs>
      <path d="M400 72 V100" className="dg-edge" markerEnd="url(#dg-to-be-dg-head)" />
      <path d="M296 144 H148 Q140 144 140 152 V240" className="dg-edge" markerEnd="url(#dg-to-be-dg-head)" />
      <path d="M400 188 V240" className="dg-edge" markerEnd="url(#dg-to-be-dg-head)" />
      <path d="M504 144 H652 Q660 144 660 152 V232" className="dg-edge" markerEnd="url(#dg-to-be-dg-head)" />
      <path d="M300 276 H240" className="dg-edge" markerEnd="url(#dg-to-be-dg-head)" />
      <path d="M500 276 H560" className="dg-edge" markerEnd="url(#dg-to-be-dg-head)" />
      <path d="M627 320 V336 Q627 344 619 344 H444 Q436 344 436 352 V372" className="dg-edge dg-dash" markerEnd="url(#dg-to-be-dg-head)" />
      <path d="M707 320 V372" className="dg-edge dg-dot" markerEnd="url(#dg-to-be-dg-head-soft)" />
      <path d="M173 312 V392 Q173 400 181 400 H300" className="dg-edge" markerEnd="url(#dg-to-be-dg-head)" />
      <path d="M107 312 V452" className="dg-edge dg-dash" markerEnd="url(#dg-to-be-dg-head)" />
      <path d="M500 412 H532 Q540 412 540 420 V508 Q540 516 548 516 H600" className="dg-edge dg-dot" markerEnd="url(#dg-to-be-dg-head-soft)" />
      <path d="M400 428 V476" className="dg-edge" markerEnd="url(#dg-to-be-dg-head)" />
      <path d="M400 532 V580" className="dg-edge" markerEnd="url(#dg-to-be-dg-head)" />
      <path d="M308 620 H240" className="dg-edge" markerEnd="url(#dg-to-be-dg-head)" />
      <path d="M400 660 V708" className="dg-edge dg-focal-edge" markerEnd="url(#dg-to-be-dg-head-focal)" />
      <path d="M500 744 H600" className="dg-edge dg-dot dg-focal-edge" markerEnd="url(#dg-to-be-dg-head-focal)" />
      <path d="M400 764 V828" className="dg-edge" markerEnd="url(#dg-to-be-dg-head)" />
      <path d="M500 852 H600" className="dg-edge dg-dash" markerEnd="url(#dg-to-be-dg-head)" />
      <rect x="204.5" y="121" width="35" height="14" rx="2" className="dg-mask" />
      <text x="222" y="132" textAnchor="middle" className="dg-label">Yes</text>
      <rect x="564" y="121" width="28" height="14" rx="2" className="dg-mask" />
      <text x="578" y="132" textAnchor="middle" className="dg-label">No</text>
      <rect x="404" y="207" width="74" height="14" rx="2" className="dg-mask" />
      <text x="408" y="218" textAnchor="start" className="dg-label">Not sure</text>
      <rect x="452" y="351" width="160" height="14" rx="2" className="dg-mask" />
      <text x="532" y="362" textAnchor="middle" className="dg-label">Needs hospital care</text>
      <rect x="260" y="597" width="28" height="14" rx="2" className="dg-mask" />
      <text x="274" y="608" textAnchor="middle" className="dg-label">No</text>
      <rect x="404" y="679" width="184" height="14" rx="2" className="dg-mask" />
      <text x="408" y="690" textAnchor="start" className="dg-label">Yes: decision to admit</text>
      <polygon points="400,100 504,144 400,188 296,144" className="dg-node" />
      <text x="400" y="148" textAnchor="middle" className="dg-name">Life-threatening?</text>
      <polygon points="400,580 492,620 400,660 308,620" className="dg-node" />
      <text x="400" y="624" textAnchor="middle" className="dg-name">Admit?</text>
      <rect x="310" y="24" width="180" height="48" rx="24" className="dg-end" />
      <text x="400" y="43" textAnchor="middle" className="dg-name">Older resident with</text>
      <text x="400" y="61" textAnchor="middle" className="dg-name">a health concern</text>
      <rect x="40" y="240" width="200" height="72" rx="6" className="dg-node" />
      <text x="140" y="271.5" textAnchor="middle" className="dg-name">Call 995</text>
      <text x="140" y="289.5" textAnchor="middle" className="dg-sub">SCDF ambulance</text>
      <rect x="300" y="240" width="200" height="72" rx="6" className="dg-node" />
      <text x="400" y="271.5" textAnchor="middle" className="dg-name">NurseFirst helpline</text>
      <text x="400" y="289.5" textAnchor="middle" className="dg-sub">advice on where to go</text>
      <rect x="560" y="232" width="200" height="88" rx="6" className="dg-node" />
      <text x="660" y="262.5" textAnchor="middle" className="dg-name">Family doctor</text>
      <text x="660" y="280.5" textAnchor="middle" className="dg-name">or polyclinic</text>
      <text x="660" y="298.5" textAnchor="middle" className="dg-sub">(Healthier SG GP clinic)</text>
      <rect x="300" y="372" width="200" height="56" rx="6" className="dg-node" />
      <text x="400" y="395" textAnchor="middle" className="dg-name">Public emergency</text>
      <text x="400" y="413" textAnchor="middle" className="dg-name">department</text>
      <rect x="20" y="452" width="220" height="104" rx="6" className="dg-node" />
      <text x="130" y="482" textAnchor="middle" className="dg-name">Alexandra Hospital</text>
      <text x="130" y="500" textAnchor="middle" className="dg-name">Urgent Care Centre</text>
      <text x="130" y="518" textAnchor="middle" className="dg-sub">eligible non-life-threatening</text>
      <text x="130" y="535" textAnchor="middle" className="dg-sub">cases, from Oct 2025</text>
      <rect x="300" y="476" width="200" height="56" rx="6" className="dg-node" />
      <text x="400" y="499" textAnchor="middle" className="dg-name">Triage, then seen</text>
      <text x="400" y="517" textAnchor="middle" className="dg-name">by an ED doctor</text>
      <rect x="80" y="596" width="160" height="48" rx="24" className="dg-end" />
      <text x="160" y="624" textAnchor="middle" className="dg-name">Discharged</text>
      <rect x="300" y="708" width="200" height="56" rx="6" className="dg-focal" />
      <text x="400" y="731" textAnchor="middle" className="dg-name">Waits in the ED</text>
      <text x="400" y="749" textAnchor="middle" className="dg-name">for a ward bed</text>
      <rect x="300" y="828" width="200" height="48" rx="6" className="dg-node" />
      <text x="400" y="856" textAnchor="middle" className="dg-name">Inpatient ward</text>
      <rect x="600" y="372" width="180" height="88" rx="6" className="dg-measure" />
      <text x="690" y="403" textAnchor="middle" className="dg-name">Access Map</text>
      <text x="690" y="421" textAnchor="middle" className="dg-sub">this site: CDMP clinics</text>
      <text x="690" y="438" textAnchor="middle" className="dg-sub">per senior, by area</text>
      <rect x="600" y="480" width="180" height="72" rx="6" className="dg-measure" />
      <text x="690" y="503" textAnchor="middle" className="dg-name">ED visits</text>
      <text x="690" y="521" textAnchor="middle" className="dg-sub">MOH: counted as</text>
      <text x="690" y="538" textAnchor="middle" className="dg-sub">an ED visit</text>
      <rect x="600" y="692" width="180" height="104" rx="6" className="dg-focal-measure" />
      <text x="690" y="722.5" textAnchor="middle" className="dg-name">ED Trends, findings</text>
      <text x="690" y="740.5" textAnchor="middle" className="dg-sub">this site: bed wait</text>
      <text x="690" y="757.5" textAnchor="middle" className="dg-sub">against each hospital&apos;s</text>
      <text x="690" y="774.5" textAnchor="middle" className="dg-sub">usual level</text>
      <rect x="600" y="816" width="180" height="104" rx="6" className="dg-end" />
      <text x="690" y="846" textAnchor="middle" className="dg-name">Transitional</text>
      <text x="690" y="864" textAnchor="middle" className="dg-name">care facility</text>
      <text x="690" y="882" textAnchor="middle" className="dg-sub">when medically stable,</text>
      <text x="690" y="899" textAnchor="middle" className="dg-sub">awaiting long-term care</text>
      <path d="M20 960 H800" className="dg-rule" />
      <rect x="20" y="976" width="28" height="16" rx="8" className="dg-end" />
      <text x="56" y="988" textAnchor="start" className="dg-label">End point</text>
      <rect x="138" y="976" width="28" height="16" rx="3" className="dg-node" />
      <text x="174" y="988" textAnchor="start" className="dg-label">Step</text>
      <path d="M222 984 H250" className="dg-edge dg-dash" />
      <text x="258" y="988" textAnchor="start" className="dg-label">Only in some cases</text>
      <rect x="402" y="976" width="28" height="16" rx="3" className="dg-measure" />
      <text x="438" y="988" textAnchor="start" className="dg-label">Measure</text>
      <rect x="506" y="976" width="28" height="16" rx="3" className="dg-focal" />
      <text x="542" y="988" textAnchor="start" className="dg-label">What this site tracks</text>
    </svg>
  );
}
