import { emptyJdContent, type JdContent } from "./recruitment-jd";

/**
 * THE JDs RUTVISHA WROTE, AS THE MASTERS (account holder, 2026-09-17).
 *
 * Ten PDFs, eight roles: Sales and Operations each arrived twice (a polished
 * "AI-optimised" version and a longer recruiter-facing one), and the two were
 * merged rather than listed separately — a recruiter picking between two JDs for
 * one job is the thing this section exists to remove. The longer version's
 * detail (interview preparation, work environment, recruitment notes) is kept
 * where it belongs: in the sections the template already has.
 *
 * ── WHY THIS IS CODE AND NOT A ONE-OFF SQL INSERT ──────────────────────────
 * The masters are the ORIGINAL — a recruiter edits their own copy and can always
 * "Reset to master" back to this text. That promise is only worth anything if
 * the master is reproducible, so it lives here in review, and
 * `ensureRecruitmentJdSeed` writes any role that is missing on load. Re-running
 * it never overwrites a master somebody has deliberately changed.
 *
 * ── CHANGING ONE ───────────────────────────────────────────────────────────
 * Edit the text below, then press "Restore from the original" on that role in
 * the workbench. Editing here alone changes nothing that already exists — by
 * design, because a master that silently rewrote itself on deploy would undo an
 * HR edit nobody had asked it to undo.
 */

/** Everything every Altus JD says about the company and the working week. */
const ABOUT_CONSULTING =
  "Altus Corp is a Business Consulting and Productivity Consulting firm that helps MSMEs improve growth through consulting, systems, execution and business transformation.\n\nWe don't just advise or consult — we simplify businesses' and business owners' lives. Our motto is #NoGyaanOnlyGain. For over two decades we have helped entrepreneurs scale smarter and faster, and our vision is to become the McKinsey of the SME/MSME sector.";

const ABOUT_EXECUTION =
  "Altus Corp is an execution-focused business consulting firm that partners with entrepreneurs, founders and business owners to improve productivity, build systems and scale businesses. We believe in implementation over theory and execution over ideas.\n\nThink McKinsey & Bain, but built for MSMEs that demand action, not just advice.";

const LOCATION = "Goregaon East, Mumbai";
const ON_SITE = "On-site (work from home is not available)";
const SIX_DAYS = "Monday to Saturday, 10:30 am – 7:30 pm";

const APPLY_STANDARD =
  "Reply to this message with your updated CV, or email it to support@unleashed.in. You can also reach us on WhatsApp at +91 99877 41410.";

const APPLY_PORTFOLIO =
  "Send us a short note telling us why this role is for you, along with your portfolio and showreel. Applications without supporting work will not be considered. Email support@unleashed.in or WhatsApp +91 99877 41410.";

export interface RecruitmentJdSeed {
  /** Stable key for the role. Never reused, never renamed — it identifies the row. */
  slug: string;
  title: string;
  sortOrder: number;
  content: JdContent;
}

function jd(slug: string, sortOrder: number, fields: Partial<JdContent> & { title: string }): RecruitmentJdSeed {
  return {
    slug,
    title: fields.title,
    sortOrder,
    content: { ...emptyJdContent(fields.title), ...fields },
  };
}

export const RECRUITMENT_JD_SEED: RecruitmentJdSeed[] = [
  /* ── 1 · SALES ─────────────────────────────────────────────────────────── */
  jd("senior-sales-manager", 10, {
    title: "Senior Sales Manager / Sales Manager",
    department: "Sales",
    location: LOCATION,
    employmentType: "Full-time",
    workMode: ON_SITE,
    workSchedule: `${SIX_DAYS}. Weekly off on Sunday; if a sales event falls on a Sunday (once in 4–5 weeks), the following Wednesday is off.`,
    experience:
      "Senior Sales Manager: 3–6 years in B2B sales, consulting sales, training or workshop sales. Sales Manager: 0–2 years (exceptional freshers may apply).",
    qualification: "Graduate (mandatory). MBA in Sales preferred.",
    salary:
      "Sales Manager: ₹1.8–4.0 LPA CTC + incentives on predefined targets. Senior Sales Manager: ₹4.8–7.2 LPA CTC (fixed + variable) + incentives over and above CTC.",
    aboutCompany: ABOUT_CONSULTING,
    summary:
      "We are looking for consultative sales professionals who can generate qualified leads, build relationships with business owners, present consulting solutions, manage the sales pipeline and achieve revenue targets.\n\nYou will call people from references and cold lists, invite them to a free orientation programme, sell in the orientation, and follow up for balance payments afterwards.",
    responsibilities: [
      "Generate and qualify leads through outbound calling, referrals and marketing campaigns.",
      "Schedule appointments and invite prospects to orientation sessions and free workshops.",
      "Conduct consultative sales conversations and present business consulting solutions.",
      "Sell in the Orientation Programme and follow up for balance payment afterwards.",
      "Manage the complete sales pipeline using CRM tools.",
      "Coordinate with the marketing department and external agencies for lead generation.",
      "Generate referrals from existing clients.",
      "Maintain accurate sales reports, forecasts and daily activity updates.",
    ].join("\n"),
    requirements: [
      "Graduate — mandatory.",
      "MBA in Sales preferred.",
      "Sales Manager: 0–2 years' experience; exceptional freshers may apply.",
      "Senior Sales Manager: 3–6 years in B2B sales, consulting sales, training or workshop sales.",
      "Candidates based in the western suburbs between Bandra and Dahisar.",
    ].join("\n"),
    skills: [
      "CRM Software",
      "Microsoft Excel",
      "Google Workspace",
      "Sales Pipeline Management",
      "Lead Management",
      "Presentation Tools",
      "Reporting",
    ].join("\n"),
    competencies: [
      "Consultative Selling",
      "Negotiation",
      "Communication",
      "Relationship Management",
      "Objection Handling",
      "Customer Acquisition",
      "Revenue Growth",
      "Presentation Skills",
    ].join("\n"),
    mustHave: [
      "Excellent verbal and written English — the candidate must speak clean English.",
      "Strong presentation and interpersonal skills.",
      "Willing to work from the Goregaon East office 6 days a week; work from home is not available.",
      "Comfortable with outbound calling, client meetings and inviting people to orientations.",
      "Carry a salary slip, offer letter or bank statement to the interview showing current pay.",
      "Prepared to do a mock sale of our Orientation Programme in the interview (a script is provided). Allow 60–90 minutes.",
    ].join("\n"),
    preferredExperience: [
      "B2B Sales",
      "Training / Workshop Sales",
      "Business Development",
      "Corporate Event Sales — selling seats for events and conferences",
      "Consulting Sales",
      "Freshers who genuinely want to be groomed in telecalling, selling and influencing",
      "Note: avoid loans and credit-card telecalling backgrounds unless communication is genuinely strong",
    ].join("\n"),
    kpis: [
      "Lead conversion rate",
      "Revenue achievement",
      "Appointments scheduled",
      "Orientation attendance",
      "Sales closure rate",
      "CRM hygiene",
      "Referral generation",
      "Customer satisfaction",
    ].join("\n"),
    benefits: [
      "Incentives on predefined targets, over and above CTC.",
      "Monthly performance conditions with flexibility to meet targets across the quarter.",
      "Salary paid on or before the 10th of the following month (typically the 3rd or 4th).",
      "Work directly with entrepreneurs and business owners.",
      "6-month probation; office is a 10–12 minute walk from Goregaon East station.",
    ].join("\n"),
    howToApply: APPLY_STANDARD,
    atsKeywords:
      "B2B Sales, Business Development, Consultative Selling, Lead Generation, Lead Qualification, CRM, Sales Pipeline, Customer Acquisition, Relationship Management, Objection Handling, Negotiation, Closing, Revenue Growth, Telecalling, Training Sales, Workshop Sales, Client Success, Account Management",
  }),

  /* ── 2 · OPERATIONS ────────────────────────────────────────────────────── */
  jd("senior-operations-consultant", 20, {
    title: "Senior Operations Consultant / Operations Consultant",
    department: "Operations",
    location: LOCATION,
    employmentType: "Full-time",
    workMode: ON_SITE,
    workSchedule: `${SIX_DAYS}. Weekly off on Sunday, plus public and religious holidays.`,
    experience:
      "Senior Operations Consultant: 3–6 years in operations, consulting, project management or the training industry. Operations Consultant: 0–2 years (exceptional freshers may apply).",
    qualification:
      "Graduate (mandatory). MBA preferred. CA Inter / IPCC passed preferred. Chartered Accountant preferred for Senior Operations Consultant.",
    salary:
      "Operations Consultant: ₹1.8–4.0 LPA CTC. Senior Operations Consultant: ₹4.8–7.2 LPA CTC, with performance-based growth and incentives.",
    aboutCompany: ABOUT_CONSULTING,
    summary:
      "We are looking for analytical, execution-focused professionals to work directly with business owners, improve operational performance, manage implementation projects, track KPIs and ensure measurable business outcomes.\n\nIn simple terms we function as outsourced CEOs and COOs to MSME and SME clients, turning around whole businesses alongside promoters, directors and heads of department.",
    responsibilities: [
      "Analyse client operations and identify improvement opportunities.",
      "Create and execute implementation plans.",
      "Get participants to complete their tools — our proprietary formats on Google Drive (training is given).",
      "Analyse the tools participants fill in and build action plans so they hit their targets.",
      "Follow up with participants daily to ensure they hit the results defined in their calendars.",
      "Empower and motivate participants into action mode and out of procrastination.",
      "Track KPIs, project milestones and action items.",
      "Maintain the Operations MIS, reports and dashboards, and send daily activity reports to management.",
      "Coordinate with stakeholders and conduct review meetings.",
    ].join("\n"),
    requirements: [
      "Graduate — mandatory.",
      "MBA preferred; CA Inter / IPCC passed preferred.",
      "Chartered Accountant preferred for the Senior Operations Consultant role.",
      "Operations Consultant: 0–2 years' experience; exceptional freshers may apply.",
      "Senior Operations Consultant: 3–6 years in operations, consulting, project management or training.",
      "Candidates based in the western suburbs between Bandra and Dahisar.",
    ].join("\n"),
    skills: [
      "Microsoft Excel",
      "Google Sheets",
      "Google Workspace",
      "MIS Reporting",
      "Project Management",
      "Business Analysis",
      "CRM Software",
      "Data Analysis",
    ].join("\n"),
    competencies: [
      "Analytical Thinking",
      "Problem Solving",
      "Critical Thinking",
      "Stakeholder Management",
      "Communication",
      "Time Management",
      "Execution Excellence",
      "Client Relationship Management",
      "Plain common sense — the candidate can make their point clearly",
    ].join("\n"),
    mustHave: [
      "Excellent verbal and written English — the candidate must speak clean English.",
      "Willing to work from the Goregaon East office 6 days a week; work from home is not available.",
      "Strong organisational and multitasking ability.",
      "Genuine interest in business and entrepreneurship.",
      "Carry a salary slip, offer letter or bank statement to the interview showing current pay.",
      "In the interview you will be given a real calendar and planner and asked what is missing from the plan. Allow 60–90 minutes.",
    ].join("\n"),
    preferredExperience: [
      "Business Consulting",
      "Operations Management",
      "Project Management — someone who has delivered projects to deadlines",
      "Startup Operations — comfortable with pressure and tight timeframes",
      "Training / Workshop Industry",
      "Management Consulting",
      "CA Inter completed but not pursuing practice; or a CA from internal audit wanting an unconventional consulting career",
      "MBA from the tier below the IIMs and Jamnalal Bajaj",
    ].join("\n"),
    kpis: [
      "Client satisfaction",
      "Implementation completion",
      "Project delivery",
      "MIS accuracy",
      "Follow-up completion",
      "KPI achievement",
      "Productivity improvement",
    ].join("\n"),
    benefits: [
      "Performance-based growth and incentives.",
      "Work directly with promoters, directors and heads of department across every function.",
      "Salary paid on the 10th of the following month; 6-month probation.",
      "Office is a 10–12 minute walk from Goregaon East station and 5 minutes from Aarey metro.",
    ].join("\n"),
    howToApply: APPLY_STANDARD,
    atsKeywords:
      "Business Consulting, Operations Management, Project Management, Process Improvement, KPI Tracking, MIS Reporting, Business Analysis, Client Success, Stakeholder Management, Google Workspace, Microsoft Excel, Productivity Consulting, Change Management, Operations Excellence, Implementation Consulting",
  }),

  /* ── 3 · BUSINESS CONSULTANT ───────────────────────────────────────────── */
  jd("business-consultant", 30, {
    title: "Business Consultant / Business Process Improvement Consultant",
    department: "Consulting",
    location: LOCATION,
    employmentType: "Full-time",
    workMode: ON_SITE,
    workSchedule: SIX_DAYS,
    experience: "3+ years in business analysis, dashboard creation and process documentation.",
    qualification:
      "Engineering, Chartered Accountancy, MBA (Operations or HR), or Cost Accounting.",
    salary: "₹4–12 LPA, reflective of skills, experience and potential.",
    aboutCompany: ABOUT_CONSULTING,
    summary:
      "As a Business Analyst / Consultant at Altus Corp you will be at the helm of business transformation. You won't just advise — you'll implement strategies that make a real-world difference, working side by side with our founder, CA Manan Vasa.",
    responsibilities: [
      "Design impactful business dashboards and MIS reports that give owners clear, actionable insight.",
      "Create streamlined systems and process flows that drive efficiency and scale operations.",
      "Develop authority metrics, evaluation tools and detailed task lists so owners can delegate effectively.",
      "Define and track KRAs and KPIs to raise performance and accountability.",
      "Collaborate directly with clients, gathering data and turning it into tangible improvements.",
      "Present data-driven solutions clearly using Excel, Google Sheets and PowerPoint.",
    ].join("\n"),
    requirements: [
      "Engineering, Chartered Accountancy, MBA (Operations/HR) or Cost Accounting background.",
      "3+ years in business analysis, dashboard creation and process documentation.",
      "Fluent in Excel, Google Sheets and PowerPoint.",
      "Ready to travel to client sites within Mumbai and across India.",
    ].join("\n"),
    skills: [
      "Microsoft Excel",
      "Google Sheets",
      "PowerPoint",
      "Dashboard Design",
      "MIS Reporting",
      "Process Documentation",
      "KRA / KPI Design",
      "Business Analysis",
    ].join("\n"),
    competencies: [
      "Exceptional communication — able to present complex information clearly",
      "Problem Solving",
      "Client Focus",
      "Structured Thinking",
      "Ownership and Execution",
    ].join("\n"),
    mustHave: [
      "Exceptional communication and problem-solving skills.",
      "Proactive and client-focused.",
      "Willing to work from the Goregaon East office 6 days a week; work from home is not available.",
      "Willing to travel to client sites in Mumbai and across India.",
    ].join("\n"),
    preferredExperience: [
      "Business Analysis",
      "Management Consulting",
      "Process Improvement",
      "Dashboard and MIS build-outs",
      "Working with SME / MSME promoters",
    ].join("\n"),
    kpis: [
      "Dashboard and MIS accuracy",
      "Process documentation delivered",
      "KRA / KPI frameworks implemented",
      "Client satisfaction",
      "Implementation completion",
    ].join("\n"),
    benefits: [
      "A competitive salary of ₹4–12 LPA, reflective of your skills and potential.",
      "Fast-track your career with direct exposure to a wide range of industries.",
      "Direct mentorship from our founder, CA Manan Vasa.",
      "A dynamic, fast-paced environment in a small, focused team driving major results.",
      "The depth of experience you gain in one year here is the equivalent of three elsewhere.",
    ].join("\n"),
    howToApply:
      "Send your resume and a cover letter explaining why you're the perfect fit to Sampada More at support@unleashed.in, or WhatsApp +91 99877 41410.",
    atsKeywords:
      "Business Analyst, Business Consultant, Process Improvement, Dashboard Design, MIS Reporting, KRA, KPI, Business Transformation, Management Consulting, Excel, Google Sheets, PowerPoint, SME, MSME, Productivity Consulting",
  }),

  /* ── 4 · BUSINESS STRATEGY INTERN ──────────────────────────────────────── */
  jd("business-strategy-intern", 40, {
    title: "Business Strategy Intern",
    department: "Consulting — Strategy",
    location: LOCATION,
    employmentType: "Full-time Internship",
    workMode: "In-person (hybrid / work from home is not available)",
    workSchedule: SIX_DAYS,
    qualification:
      "Pursuing or recently completed a degree in Engineering, BBA, BMS, Economics or MBA.",
    salary: "As per internship norms; full-time role offered on performance.",
    aboutCompany: ABOUT_CONSULTING,
    summary:
      "As a Business Strategy Intern you will work closely with the core consulting team to build, refine and validate business strategies. Your focus is purely strategy — not execution or process implementation.\n\nThis is not routine intern work. You will be thinking, analysing and contributing to real strategic decisions that shape businesses.",
    responsibilities: [
      "Conduct deep market research and industry analysis to identify trends, gaps and opportunities.",
      "Support the creation of business growth strategies and expansion plans.",
      "Work on competitor analysis and benchmarking across industries.",
      "Assist in problem structuring and hypothesis building for client challenges.",
      "Contribute to go-to-market strategies and business model innovation.",
      "Analyse business data to derive strategic insights and recommendations.",
      "Support the creation of high-impact strategy decks and presentations.",
      "Participate in strategy discussions and brainstorming with senior consultants.",
    ].join("\n"),
    requirements: [
      "Pursuing or recently completed Engineering, BBA, BMS, Economics or MBA.",
      "Strong interest in strategy, consulting and business problem-solving.",
      "Excellent analytical and research skills.",
      "Based in Mumbai and available for in-person work.",
    ].join("\n"),
    skills: [
      "Market Research",
      "Competitor Analysis",
      "Market Sizing",
      "Data Analysis",
      "Presentation Design",
      "Microsoft Excel",
      "Google Workspace",
    ].join("\n"),
    competencies: [
      "Structured Thinking",
      "Analytical Rigour",
      "Communication and Presentation",
      "Curiosity and Proactiveness",
      "Comfort with ambiguity",
    ].join("\n"),
    mustHave: [
      "Sharp thinkers, not just doers.",
      "Comfortable working with data, insights and structured frameworks.",
      "Strong communication and presentation skills.",
      "Based in Mumbai, available in person 6 days a week.",
    ].join("\n"),
    kpis: [
      "Quality of research and analysis",
      "Strategy decks delivered",
      "Insight quality in client discussions",
      "Turnaround on assigned analysis",
    ].join("\n"),
    benefits: [
      "How top consulting firms approach business strategy and problem solving.",
      "Hands-on exposure to real client business challenges across industries.",
      "Structured thinking frameworks — market sizing, strategic analysis, growth modelling.",
      "How to convert ambiguity into clear strategic direction.",
      "Direct mentorship from experienced consultants, including Manan Vasa.",
      "Opportunity for a full-time role based on performance.",
    ].join("\n"),
    howToApply: APPLY_STANDARD,
    atsKeywords:
      "Strategy Intern, Business Strategy, Market Research, Competitor Analysis, Market Sizing, Go-To-Market, Business Model Innovation, Consulting Intern, Management Consulting, Data Analysis",
  }),

  /* ── 5 · BACK OFFICE, ADMIN & HR (AI-FIRST) ────────────────────────────── */
  jd("back-office-admin-hr-executive", 50, {
    title: "Back Office, Admin & HR Executive (AI-First)",
    department: "HR & Administration",
    location: LOCATION,
    employmentType: "Full-time",
    workMode: "On-site",
    workSchedule: "Monday to Saturday",
    experience: "0–3 years. Freshers with AI skills are welcome.",
    qualification:
      "Bachelor's degree in Commerce, HR, Business Administration or a related field.",
    salary: "₹17,000 – ₹20,000 per month, based on skills, experience and performance.",
    aboutCompany: ABOUT_EXECUTION,
    summary:
      "We are looking for a highly organised, proactive and AI-enabled Back Office, Admin & HR Executive to manage administrative operations, HR coordination, documentation and internal process management.",
    responsibilities: [
      "Manage day-to-day back-office operations, administrative processes and internal coordination.",
      "Maintain digital records, company databases, documentation and process trackers.",
      "Update CRM/ERP systems and prepare accurate MIS reports and business dashboards.",
      "Coordinate seamlessly with the Sales, Finance, Operations and Consulting teams.",
      "Handle office administration, meeting schedules, vendor coordination and inventory management.",
      "Prepare professional business documents, official letters, reports and presentations.",
      "Support the planning and execution of workshops, events and participant coordination.",
      "Assist in recruitment, interview scheduling, onboarding, attendance management and employee records.",
      "Prepare HR documentation — offer letters, appointment letters, experience letters — ensuring HR compliance.",
      "Leverage AI tools (ChatGPT, Claude, Gemini, Copilot) to draft content, automate repetitive tasks and validate AI output for accuracy.",
    ].join("\n"),
    requirements: [
      "Bachelor's degree in Commerce, HR, Business Administration or related field.",
      "0–3 years of experience; freshers with AI skills are welcome.",
    ].join("\n"),
    skills: [
      "Office Administration",
      "HR Operations",
      "Documentation",
      "Microsoft Excel",
      "Google Workspace",
      "CRM",
      "AI Tools — ChatGPT, Claude, Gemini, Microsoft Copilot",
    ].join("\n"),
    competencies: ["Communication", "Attention to Detail", "Organisation", "Proactiveness"].join("\n"),
    mustHave: [
      "Highly organised and proactive.",
      "Comfortable using AI tools daily and validating what they produce.",
      "On-site at Goregaon East, Monday to Saturday.",
    ].join("\n"),
    kpis: [
      "Documentation accuracy",
      "Recruitment efficiency",
      "Onboarding turnaround",
      "MIS reporting",
      "AI adoption",
      "Process improvement",
    ].join("\n"),
    benefits: [
      "Work with entrepreneurs and business leaders.",
      "Learn AI-powered business operations.",
      "Fast career growth through execution and ownership.",
    ].join("\n"),
    howToApply: APPLY_STANDARD,
    atsKeywords:
      "Back Office Executive, HR Executive, Administration Executive, Operations, Recruitment, Employee Onboarding, MIS Reporting, Documentation, Google Workspace, Microsoft Excel, CRM, AI Tools, ChatGPT, Claude AI, Gemini, Microsoft Copilot, SOP, Process Management",
  }),

  /* ── 6 · BACK OFFICE EXECUTIVE ─────────────────────────────────────────── */
  jd("back-office-executive", 60, {
    title: "Back Office Executive",
    department: "Administration",
    location: LOCATION,
    employmentType: "Full-time",
    workMode: "On-site only",
    workSchedule: "Monday to Saturday",
    qualification: "Bachelor's degree or equivalent preferred.",
    salary: "₹17,000 – ₹20,000 per month, based on skills and performance.",
    aboutCompany: ABOUT_EXECUTION,
    summary:
      "Manage the daily operational and administrative engine behind the consulting team — records, reporting, coordination between departments, and support at our productivity and colloquium workshops.",
    responsibilities: [
      "Manage and maintain daily operational and administrative processes.",
      "Organise and update internal records, reports and data.",
      "Provide backend coordination and reporting support to the sales and finance teams.",
      "Ensure smooth and timely communication between departments.",
      "Track daily activities and share concise reports with management.",
      "Assist senior consultants during productivity and colloquium workshops.",
      "Coordinate with participants and analyse workshop tools.",
    ].join("\n"),
    requirements: [
      "Bachelor's degree or equivalent qualification preferred.",
      "Proficiency in MS Office and data management tools.",
    ].join("\n"),
    skills: ["MS Office", "Data Management", "Reporting", "Coordination"].join("\n"),
    competencies: [
      "Strong communication and coordination",
      "Attention to detail",
      "Reliability and a proactive work ethic",
    ].join("\n"),
    mustHave: [
      "On-site at Goregaon East — no hybrid, no shortcuts.",
      "Monday to Saturday.",
      "Proactive, detail-oriented and reliable.",
    ].join("\n"),
    kpis: [
      "Record and report accuracy",
      "Turnaround on daily activity reports",
      "Workshop coordination",
      "Inter-department responsiveness",
    ].join("\n"),
    benefits: [
      "Work directly with entrepreneurs and business leaders.",
      "Be part of a core team shaping the next generation of consulting.",
      "A culture of ownership, accountability and execution.",
      "Learn faster, grow faster — achieve in 3 years what others take 8 to do.",
    ].join("\n"),
    howToApply: APPLY_STANDARD,
    atsKeywords:
      "Back Office Executive, Administration, Operations Support, MIS, Data Management, MS Office, Coordination, Reporting, Workshop Coordination",
  }),

  /* ── 7 · DIGITAL MARKETING INTERN ──────────────────────────────────────── */
  jd("digital-marketing-intern", 70, {
    title: "Digital Marketing Intern — Performance Ads · SEO · Google Analytics",
    department: "Marketing",
    location: LOCATION,
    employmentType: "Internship — Summer 2026 (1 opening)",
    workMode: "On-site / Hybrid",
    workSchedule: SIX_DAYS,
    duration: "3 months",
    qualification: "Student or recent graduate. Campaign samples or case studies are mandatory.",
    salary: "Monthly stipend + certificate of completion + letter of recommendation.",
    aboutCompany: ABOUT_EXECUTION,
    summary:
      "You will be the performance engine behind our clients' digital growth — running paid ads on Google and Meta, owning SEO strategy, and using Google Analytics to turn data into sharp decisions. You will present campaign results directly to founders, so excellent communication is non-negotiable.\n\nAI marketing tools are introduced as part of your training; we care most that you already have real, hands-on ad and SEO experience.",
    responsibilities: [
      "Plan, launch and optimise Google Ads campaigns (Search, Display, YouTube) end to end.",
      "Run Facebook and Meta Ads — audience targeting, A/B testing, creative briefs, budget scaling.",
      "Own SEO strategy — keyword research, on-page optimisation, content briefs, backlink outreach.",
      "Monitor and interpret campaign data using Google Analytics and Meta Ads Manager.",
      "Prepare weekly performance reports and present insights directly to founders.",
      "Brief the Creative Intern on ad creatives and iterate on live performance data.",
      "Use AI tools to accelerate research, ad copy and competitor analysis (training provided).",
    ].join("\n"),
    requirements: [
      "Student or recent graduate — campaign samples or case studies are mandatory to apply.",
      "Proven experience running Google Ads — campaign screenshots or results required.",
      "Proven experience running Meta / Facebook Ads — results or case studies required.",
      "Working knowledge of Google Analytics — able to read, analyse and act on data.",
      "Understanding of SEO fundamentals — on-page, off-page and keyword strategy.",
    ].join("\n"),
    skills: [
      "Google Ads",
      "Meta Ads Manager",
      "Facebook Ads",
      "Google Analytics",
      "Google Search Console",
      "SEO Tools",
      "AI marketing tools (ChatGPT, Claude, Surfer SEO) — a bonus; full training provided",
    ].join("\n"),
    competencies: [
      "Excellent verbal and written communication — you will present to founders directly",
      "Data-driven mindset — decisions from numbers, not instinct alone",
      "Ownership of live budgets",
    ].join("\n"),
    mustHave: [
      "Campaign samples, ad results or case studies — applications without supporting work are not considered.",
      "Excellent verbal and written communication.",
      "Available in person in Mumbai for the internship.",
    ].join("\n"),
    kpis: [
      "Campaign performance against spend",
      "Lead volume and cost per lead",
      "SEO ranking movement",
      "Reporting accuracy and timeliness",
    ].join("\n"),
    benefits: [
      "Monthly stipend.",
      "Certificate of completion.",
      "Letter of recommendation.",
      "A live track record of ad campaigns managed and results delivered for real clients.",
      "Direct mentorship working alongside real entrepreneurs on the ground in Mumbai.",
    ].join("\n"),
    howToApply: APPLY_PORTFOLIO,
    atsKeywords:
      "Digital Marketing Intern, Google Ads, Meta Ads, Facebook Ads, SEO, Google Analytics, Google Search Console, Performance Marketing, PPC, Keyword Research, Campaign Optimisation, AI Marketing Tools",
  }),

  /* ── 8 · CREATIVE INTERN ───────────────────────────────────────────────── */
  jd("creative-intern", 80, {
    title: "Creative Intern — Video Editor · Videographer · Graphic Designer",
    department: "Marketing — Creative",
    location: LOCATION,
    employmentType: "Internship — Summer 2026 (2 openings)",
    workMode: "On-site / Hybrid",
    workSchedule: SIX_DAYS,
    duration: "3 months",
    qualification: "Student or recent graduate. Portfolio and showreel are mandatory.",
    salary: "Monthly stipend + certificate of completion + letter of recommendation.",
    aboutCompany: ABOUT_EXECUTION,
    summary:
      "You will be the visual backbone of our clients' brands — shooting content on location, editing polished videos, and designing graphics that make people stop scrolling. You will work directly with founders, so excellent communication is non-negotiable.\n\nAI creative tools are introduced as part of your training; we care far more that you already master the core software.",
    responsibilities: [
      "Go on location and shoot brand, product and campaign videos as the team videographer.",
      "Edit and colour-grade videos in Premiere Pro and apply motion graphics in After Effects.",
      "Design social media creatives, ad banners and marketing collateral in Photoshop and Illustrator.",
      "Produce logos, brand kits, brochures and print-ready files in CorelDraw.",
      "Create short-form content — Reels, YouTube Shorts, Stories — optimised per platform.",
      "Present creative concepts and finished work directly to founders and clients.",
      "Coordinate with the Digital Marketing Intern to align visuals with live campaign needs.",
    ].join("\n"),
    requirements: [
      "Student or recent graduate — portfolio and showreel are mandatory to apply.",
      "Demonstrated proficiency in Premiere Pro and After Effects — showreel required.",
      "Hands-on skills in Photoshop, Illustrator and CorelDraw — portfolio required.",
      "Comfortable operating a camera on location as a videographer.",
    ].join("\n"),
    skills: [
      "Adobe Premiere Pro",
      "After Effects",
      "Photoshop",
      "Illustrator",
      "CorelDraw",
      "Videography",
      "AI creative tools (Midjourney, Runway, Adobe Firefly) — a bonus; full training provided",
    ].join("\n"),
    competencies: [
      "Excellent verbal and written communication — you will present work to clients",
      "Strong visual storytelling instincts",
      "An eye for detail",
    ].join("\n"),
    mustHave: [
      "Portfolio and showreel — applications without supporting work are not considered.",
      "Comfortable operating a camera on location.",
      "Available in person in Mumbai for the internship.",
    ].join("\n"),
    kpis: [
      "Volume and quality of content shipped",
      "Turnaround time per edit",
      "Engagement on short-form content",
      "Client and founder sign-off rate",
    ].join("\n"),
    benefits: [
      "Monthly stipend.",
      "Certificate of completion.",
      "Letter of recommendation.",
      "A live portfolio of branded content, videos and campaigns shipped for real clients.",
      "Direct mentorship working alongside real entrepreneurs on the ground.",
    ].join("\n"),
    howToApply: APPLY_PORTFOLIO,
    atsKeywords:
      "Creative Intern, Video Editor, Videographer, Graphic Designer, Adobe Premiere Pro, After Effects, Photoshop, Illustrator, CorelDraw, Motion Graphics, Reels, Short-Form Content, Brand Design",
  }),
];

/** Lookup by slug, for the workbench and the actions. */
export const RECRUITMENT_JD_SEED_BY_SLUG = new Map(RECRUITMENT_JD_SEED.map((s) => [s.slug, s]));
