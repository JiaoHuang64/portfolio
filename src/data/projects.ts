export type Project = {
  id: string;
  title: string;
  subtitle?: string;   // ← 新增：给 ProjectCard.tsx 用
  org: string;
  period: string;
  role: string;
  oneLiner: string;
  bullets: string[];
  tags: string[];
};

export const projects: Project[] = [
  {
    id: "roche-enzyme-assay",
    title: "Enzyme Process Development & Quantitative Activity Assay",
    subtitle:
      "Downstream purification and quantitative enzyme activity assay development in a GMP-aligned lab environment.",
    org: "Roche Diagnostics · Novel Enzymes Team",
    period: "Nov 2025 – Present",
    role: "R&D Intern (Industrial Placement)",
    oneLiner:
      "Downstream purification and quantitative enzyme activity assay development in a GMP-aligned lab environment.",
    bullets: [
      "Executed AKTA chromatography purification and TFF (UF/DF) buffer-exchange workflows following structured batch protocols",
      "Worked under GMP-aligned documentation practices with full ELN traceability",
      "Developed a quantitative gel-shift assay protocol to evaluate Enzyme A reverse activity",
      "Improved assay reproducibility through protocol standardisation and parameter control",
      "Supported experiment planning, deviation troubleshooting, and root-cause investigation"
    ],
    tags: ["AKTA", "TFF", "Downstream", "GMP", "Assay", "Enzyme"]
  },

  {
    id: "cranfield-lamp-readout",
    title: "Paper-based LAMP Biosensor Automated Readout",
    subtitle:
      "Automated quantitative readout pipeline for paper-based LAMP biosensors using computer vision and lightweight ML.",
    org: "Zhugen Yang Lab · Cranfield University",
    period: "Jun – Sep 2025",
    role: "Research Assistant",
    oneLiner:
      "Automated quantitative readout pipeline for paper-based LAMP biosensors using computer vision and lightweight ML.",
    bullets: [
      "Developed automated image-analysis pipeline using OpenCV and Python",
      "Implemented LAB colour-space features for quantitative signal extraction",
      "Built mathematical feature model for biosensor colour response",
      "Trained logistic regression classifier achieving 87% accuracy on labelled images",
      "Integrated pipeline into a lightweight Flask app for rapid per-image readout"
    ],
    tags: ["OpenCV", "ML", "Biosensor", "Python", "Flask", "Image Analysis"]
  },

  {
    id: "ucl-ra-mab-design",
    title: "Rheumatoid Arthritis mAb Production — Integrated Process Design",
    subtitle:
      "End-to-end monoclonal antibody process design including perfusion strategy, DSP architecture, and sustainability optimisation.",
    org: "UCL · Bioprocess Design Project",
    period: "Sep – Dec 2024",
    role: "Team Member (Process Economics & Design)",
    oneLiner:
      "End-to-end monoclonal antibody process design including perfusion strategy, DSP architecture, and sustainability optimisation.",
    bullets: [
      "Designed integrated bioprocess architecture for TNF-α monoclonal antibody biosimilar",
      "Built mathematical model to evaluate perfusion-based production strategy",
      "Designed downstream sequence including Protein A capture and polishing steps",
      "Proposed buffer and solvent recycling strategies reducing buffer usage up to 80%",
      "Integrated sustainability measures including buffer reuse and CO₂ off-gas capture"
    ],
    tags: ["Bioprocess", "mAb", "Perfusion", "DSP", "Sustainability"]
  },

  {
    id: "ucl-control-modelling",
    title: "Reaction–Chromatographic Process Control Modelling",
    subtitle:
      "Dynamic modelling and PID control optimisation for coupled reaction and chromatographic separation systems.",
    org: "UCL · Process Modelling & Control",
    period: "Jan – Mar 2024",
    role: "Course Project",
    oneLiner:
      "Dynamic modelling and PID control optimisation for coupled reaction and chromatographic separation systems.",
    bullets: [
      "Built dynamic reaction–chromatographic model in MATLAB Simulink",
      "Developed neural-network surrogate model for reaction kinetics",
      "Performed parameter normalisation and model fitting",
      "Designed and tuned PID control loops using Simulink optimisation tools",
      "Simulated disturbance response and stability behaviour"
    ],
    tags: ["Simulink", "PID", "Control", "Modelling", "Process Dynamics"]
  },

  {
    id: "arxiv-curation-bot",
    title: "arXiv Research Curation Automation Bot",
    subtitle:
      "Automation system for filtering and publishing relevant scientific preprints using ML relevance scoring.",
    org: "City University of Hong Kong",
    period: "Jun – Aug 2024",
    role: "Research Assistant",
    oneLiner:
      "Automation system for filtering and publishing relevant scientific preprints using ML relevance scoring.",
    bullets: [
      "Developed Python automation bot to curate arXiv preprints",
      "Applied ML relevance model to normalised titles and abstracts",
      "Automated daily API extraction and filtering workflows",
      "Improved representative figure extraction logic",
      "Built stable automated publishing pipeline"
    ],
    tags: ["Python", "API", "Automation", "ML", "Data Pipeline"]
  },

  {
    id: "wantai-qc",
    title: "IVD Reagent Quality Control Internship",
    subtitle:
      "Quality control testing and statistical evaluation of in-vitro diagnostic reagents.",
    org: "Beijing WanTai Biological Pharmacy",
    period: "Jul – Sep 2023",
    role: "Experiment Assistant",
    oneLiner:
      "Quality control testing and statistical evaluation of in-vitro diagnostic reagents.",
    bullets: [
      "Performed QC testing using automated diagnostic analysers",
      "Assisted PCR-based analysis of clinical serum samples",
      "Conducted statistical analysis of assay accuracy and repeatability",
      "Supported routine laboratory QC workflows"
    ],
    tags: ["QC", "PCR", "Diagnostics", "Statistics"]
  }
];