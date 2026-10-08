export namespace main {
	
	export class AIProvider {
	    id: string;
	    label: string;
	    unavailable: string;
	
	    static createFrom(source: any = {}) {
	        return new AIProvider(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.label = source["label"];
	        this.unavailable = source["unavailable"];
	    }
	}
	export class AIProviderTest {
	    model: string;
	    millis: number;
	
	    static createFrom(source: any = {}) {
	        return new AIProviderTest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.model = source["model"];
	        this.millis = source["millis"];
	    }
	}
	export class Attachment {
	    id: string;
	    jobId: string;
	    label: string;
	    fileName: string;
	    storedPath: string;
	    addedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new Attachment(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.jobId = source["jobId"];
	        this.label = source["label"];
	        this.fileName = source["fileName"];
	        this.storedPath = source["storedPath"];
	        this.addedAt = source["addedAt"];
	    }
	}
	export class ScoreSet {
	    communication: number;
	    structure: number;
	    relevance: number;
	    depth: number;
	    confidence: number;
	
	    static createFrom(source: any = {}) {
	        return new ScoreSet(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.communication = source["communication"];
	        this.structure = source["structure"];
	        this.relevance = source["relevance"];
	        this.depth = source["depth"];
	        this.confidence = source["confidence"];
	    }
	}
	export class AttemptSummary {
	    id: string;
	    startedAt: string;
	    overall?: ScoreSet;
	
	    static createFrom(source: any = {}) {
	        return new AttemptSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.startedAt = source["startedAt"];
	        this.overall = this.convertValues(source["overall"], ScoreSet);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class CompPackage {
	    id: string;
	    jobId: string;
	    kind: string;
	    label: string;
	    parentId: string;
	    baseSalary: number;
	    signingBonus: number;
	    signingClawbackMonths: number;
	    targetBonusPct: number;
	    annualRaisePct: number;
	    equityType: string;
	    rsuGrantValue: number;
	    optionShares: number;
	    optionStrike: number;
	    shareValue: number;
	    vesting: string;
	    vestingCustom: string;
	    k401MatchPct: number;
	    k401MatchCapPct: number;
	    k401ContribPct: number;
	    healthPremiumAnnual: number;
	    stipendsAnnual: number;
	    otherAnnual: number;
	    ptoDays: number;
	    occupationCode: string;
	    areaCode: string;
	    taxState: string;
	    localTaxPct: number;
	    notes: string;
	    createdAt: string;
	    updatedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new CompPackage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.jobId = source["jobId"];
	        this.kind = source["kind"];
	        this.label = source["label"];
	        this.parentId = source["parentId"];
	        this.baseSalary = source["baseSalary"];
	        this.signingBonus = source["signingBonus"];
	        this.signingClawbackMonths = source["signingClawbackMonths"];
	        this.targetBonusPct = source["targetBonusPct"];
	        this.annualRaisePct = source["annualRaisePct"];
	        this.equityType = source["equityType"];
	        this.rsuGrantValue = source["rsuGrantValue"];
	        this.optionShares = source["optionShares"];
	        this.optionStrike = source["optionStrike"];
	        this.shareValue = source["shareValue"];
	        this.vesting = source["vesting"];
	        this.vestingCustom = source["vestingCustom"];
	        this.k401MatchPct = source["k401MatchPct"];
	        this.k401MatchCapPct = source["k401MatchCapPct"];
	        this.k401ContribPct = source["k401ContribPct"];
	        this.healthPremiumAnnual = source["healthPremiumAnnual"];
	        this.stipendsAnnual = source["stipendsAnnual"];
	        this.otherAnnual = source["otherAnnual"];
	        this.ptoDays = source["ptoDays"];
	        this.occupationCode = source["occupationCode"];
	        this.areaCode = source["areaCode"];
	        this.taxState = source["taxState"];
	        this.localTaxPct = source["localTaxPct"];
	        this.notes = source["notes"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class MarketResult {
	    found: boolean;
	    percentile: number;
	    qualifier: string;
	    points: number[];
	    level: string;
	    areaCode: string;
	    areaTitle: string;
	    occCode: string;
	    occTitle: string;
	
	    static createFrom(source: any = {}) {
	        return new MarketResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.found = source["found"];
	        this.percentile = source["percentile"];
	        this.qualifier = source["qualifier"];
	        this.points = source["points"];
	        this.level = source["level"];
	        this.areaCode = source["areaCode"];
	        this.areaTitle = source["areaTitle"];
	        this.occCode = source["occCode"];
	        this.occTitle = source["occTitle"];
	    }
	}
	export class Scenario {
	    multiplier: number;
	    value: number;
	
	    static createFrom(source: any = {}) {
	        return new Scenario(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.multiplier = source["multiplier"];
	        this.value = source["value"];
	    }
	}
	export class MarketBaseline {
	    occTitle: string;
	    areaTitle: string;
	    level: string;
	    median: number;
	    baseDelta: number;
	
	    static createFrom(source: any = {}) {
	        return new MarketBaseline(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.occTitle = source["occTitle"];
	        this.areaTitle = source["areaTitle"];
	        this.level = source["level"];
	        this.median = source["median"];
	        this.baseDelta = source["baseDelta"];
	    }
	}
	export class Deltas {
	    year1Total: number;
	    avgPerYear: number;
	    year1TakeHome: number;
	
	    static createFrom(source: any = {}) {
	        return new Deltas(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.year1Total = source["year1Total"];
	        this.avgPerYear = source["avgPerYear"];
	        this.year1TakeHome = source["year1TakeHome"];
	    }
	}
	export class TaxResult {
	    federal: number;
	    socialSecurity: number;
	    medicare: number;
	    state: number;
	    local: number;
	    total: number;
	    effectiveRate: number;
	    stateName: string;
	    stateSource: string;
	    year: number;
	
	    static createFrom(source: any = {}) {
	        return new TaxResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.federal = source["federal"];
	        this.socialSecurity = source["socialSecurity"];
	        this.medicare = source["medicare"];
	        this.state = source["state"];
	        this.local = source["local"];
	        this.total = source["total"];
	        this.effectiveRate = source["effectiveRate"];
	        this.stateName = source["stateName"];
	        this.stateSource = source["stateSource"];
	        this.year = source["year"];
	    }
	}
	export class YearBreakdown {
	    year: number;
	    base: number;
	    bonus: number;
	    signing: number;
	    equity: number;
	    benefits: number;
	    total: number;
	    taxable: number;
	    takeHome: number;
	
	    static createFrom(source: any = {}) {
	        return new YearBreakdown(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.year = source["year"];
	        this.base = source["base"];
	        this.bonus = source["bonus"];
	        this.signing = source["signing"];
	        this.equity = source["equity"];
	        this.benefits = source["benefits"];
	        this.total = source["total"];
	        this.taxable = source["taxable"];
	        this.takeHome = source["takeHome"];
	    }
	}
	export class PackageResult {
	    years: YearBreakdown[];
	    year1Total: number;
	    fourYearTotal: number;
	    avgPerYear: number;
	    year1TakeHome: number;
	    tax1: TaxResult;
	    deltaVsCurrent?: Deltas;
	    marketBaseline?: MarketBaseline;
	    ptoValue: number;
	    scenarios: Scenario[];
	    market?: MarketResult;
	    colIndex: number;
	    homeColIndex: number;
	    colLevel: string;
	    colAreaTitle: string;
	    homeAreaTitle: string;
	    year1ColAdjusted: number;
	    warnings: string[];
	
	    static createFrom(source: any = {}) {
	        return new PackageResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.years = this.convertValues(source["years"], YearBreakdown);
	        this.year1Total = source["year1Total"];
	        this.fourYearTotal = source["fourYearTotal"];
	        this.avgPerYear = source["avgPerYear"];
	        this.year1TakeHome = source["year1TakeHome"];
	        this.tax1 = this.convertValues(source["tax1"], TaxResult);
	        this.deltaVsCurrent = this.convertValues(source["deltaVsCurrent"], Deltas);
	        this.marketBaseline = this.convertValues(source["marketBaseline"], MarketBaseline);
	        this.ptoValue = source["ptoValue"];
	        this.scenarios = this.convertValues(source["scenarios"], Scenario);
	        this.market = this.convertValues(source["market"], MarketResult);
	        this.colIndex = source["colIndex"];
	        this.homeColIndex = source["homeColIndex"];
	        this.colLevel = source["colLevel"];
	        this.colAreaTitle = source["colAreaTitle"];
	        this.homeAreaTitle = source["homeAreaTitle"];
	        this.year1ColAdjusted = source["year1ColAdjusted"];
	        this.warnings = source["warnings"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ComparisonItem {
	    package: CompPackage;
	    result: PackageResult;
	    company: string;
	    position: string;
	    jobStatus: string;
	
	    static createFrom(source: any = {}) {
	        return new ComparisonItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.package = this.convertValues(source["package"], CompPackage);
	        this.result = this.convertValues(source["result"], PackageResult);
	        this.company = source["company"];
	        this.position = source["position"];
	        this.jobStatus = source["jobStatus"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Contact {
	    id: string;
	    jobId: string;
	    name: string;
	    role: string;
	    email: string;
	    phone: string;
	    linkedinUrl: string;
	    notes: string;
	
	    static createFrom(source: any = {}) {
	        return new Contact(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.jobId = source["jobId"];
	        this.name = source["name"];
	        this.role = source["role"];
	        this.email = source["email"];
	        this.phone = source["phone"];
	        this.linkedinUrl = source["linkedinUrl"];
	        this.notes = source["notes"];
	    }
	}
	export class CutOff {
	    spokeMs: number;
	    gapMs: number;
	
	    static createFrom(source: any = {}) {
	        return new CutOff(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.spokeMs = source["spokeMs"];
	        this.gapMs = source["gapMs"];
	    }
	}
	export class SourceInfo {
	    name: string;
	    release: string;
	    url: string;
	    note: string;
	
	    static createFrom(source: any = {}) {
	        return new SourceInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.release = source["release"];
	        this.url = source["url"];
	        this.note = source["note"];
	    }
	}
	export class DataSources {
	    bls: SourceInfo;
	    bea: SourceInfo;
	    tax: SourceInfo;
	    built: string;
	
	    static createFrom(source: any = {}) {
	        return new DataSources(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.bls = this.convertValues(source["bls"], SourceInfo);
	        this.bea = this.convertValues(source["bea"], SourceInfo);
	        this.tax = this.convertValues(source["tax"], SourceInfo);
	        this.built = source["built"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class InboxCounts {
	    new: number;
	    inbox: number;
	    saved: number;
	    dismissed: number;
	
	    static createFrom(source: any = {}) {
	        return new InboxCounts(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.new = source["new"];
	        this.inbox = source["inbox"];
	        this.saved = source["saved"];
	        this.dismissed = source["dismissed"];
	    }
	}
	export class Interview {
	    id: string;
	    jobId: string;
	    kind: string;
	    scheduledAt: string;
	    durationMin: number;
	    locationOrLink: string;
	    notes: string;
	    completed: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Interview(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.jobId = source["jobId"];
	        this.kind = source["kind"];
	        this.scheduledAt = source["scheduledAt"];
	        this.durationMin = source["durationMin"];
	        this.locationOrLink = source["locationOrLink"];
	        this.notes = source["notes"];
	        this.completed = source["completed"];
	    }
	}
	export class InterviewKind {
	    id: string;
	    label: string;
	
	    static createFrom(source: any = {}) {
	        return new InterviewKind(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.label = source["label"];
	    }
	}
	export class InterviewPersona {
	    id: string;
	    label: string;
	    description: string;
	
	    static createFrom(source: any = {}) {
	        return new InterviewPersona(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.label = source["label"];
	        this.description = source["description"];
	    }
	}
	export class InterviewOptions {
	    kinds: InterviewKind[];
	    personas: InterviewPersona[];
	    minutes: number[];
	
	    static createFrom(source: any = {}) {
	        return new InterviewOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kinds = this.convertValues(source["kinds"], InterviewKind);
	        this.personas = this.convertValues(source["personas"], InterviewPersona);
	        this.minutes = source["minutes"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class ResumeClaim {
	    claim: string;
	    probe: string;
	
	    static createFrom(source: any = {}) {
	        return new ResumeClaim(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.claim = source["claim"];
	        this.probe = source["probe"];
	    }
	}
	export class PlannedQuestion {
	    question: string;
	    tests: string;
	    minutes: number;
	    probes: string[];
	    strongAnswer: string[];
	
	    static createFrom(source: any = {}) {
	        return new PlannedQuestion(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.question = source["question"];
	        this.tests = source["tests"];
	        this.minutes = source["minutes"];
	        this.probes = source["probes"];
	        this.strongAnswer = source["strongAnswer"];
	    }
	}
	export class InterviewPlan {
	    questions: PlannedQuestion[];
	    resumeClaims: ResumeClaim[];
	
	    static createFrom(source: any = {}) {
	        return new InterviewPlan(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.questions = this.convertValues(source["questions"], PlannedQuestion);
	        this.resumeClaims = this.convertValues(source["resumeClaims"], ResumeClaim);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class InterviewPlanRecord {
	    id: string;
	    provider: string;
	    model: string;
	    createdAt: string;
	    plan: InterviewPlan;
	
	    static createFrom(source: any = {}) {
	        return new InterviewPlanRecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.provider = source["provider"];
	        this.model = source["model"];
	        this.createdAt = source["createdAt"];
	        this.plan = this.convertValues(source["plan"], InterviewPlan);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class InterviewSetup {
	    kind: string;
	    minutes: number;
	    persona: string;
	    voice: string;
	    interviewerName: string;
	    focus: string;
	    planProvider: string;
	    retryOf: string;
	
	    static createFrom(source: any = {}) {
	        return new InterviewSetup(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.minutes = source["minutes"];
	        this.persona = source["persona"];
	        this.voice = source["voice"];
	        this.interviewerName = source["interviewerName"];
	        this.focus = source["focus"];
	        this.planProvider = source["planProvider"];
	        this.retryOf = source["retryOf"];
	    }
	}
	export class InterviewTip {
	    answerAtMs: number;
	    kind: string;
	    text: string;
	    provider: string;
	    model: string;
	
	    static createFrom(source: any = {}) {
	        return new InterviewTip(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.answerAtMs = source["answerAtMs"];
	        this.kind = source["kind"];
	        this.text = source["text"];
	        this.provider = source["provider"];
	        this.model = source["model"];
	    }
	}
	export class Job {
	    id: string;
	    company: string;
	    position: string;
	    status: string;
	    closeReason: string;
	    location: string;
	    workMode: string;
	    salaryMin?: number;
	    salaryMax?: number;
	    salaryText: string;
	    url: string;
	    source: string;
	    description: string;
	    datePosted: string;
	    dateApplied: string;
	    followUpOn: string;
	    notes: string;
	    createdAt: string;
	    updatedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new Job(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.company = source["company"];
	        this.position = source["position"];
	        this.status = source["status"];
	        this.closeReason = source["closeReason"];
	        this.location = source["location"];
	        this.workMode = source["workMode"];
	        this.salaryMin = source["salaryMin"];
	        this.salaryMax = source["salaryMax"];
	        this.salaryText = source["salaryText"];
	        this.url = source["url"];
	        this.source = source["source"];
	        this.description = source["description"];
	        this.datePosted = source["datePosted"];
	        this.dateApplied = source["dateApplied"];
	        this.followUpOn = source["followUpOn"];
	        this.notes = source["notes"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class JobSource {
	    id: string;
	    label: string;
	    kind: string;
	    maxResults: number;
	    note: string;
	    defaultOn: boolean;
	    unavailable: string;
	
	    static createFrom(source: any = {}) {
	        return new JobSource(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.label = source["label"];
	        this.kind = source["kind"];
	        this.maxResults = source["maxResults"];
	        this.note = source["note"];
	        this.defaultOn = source["defaultOn"];
	        this.unavailable = source["unavailable"];
	    }
	}
	export class JobSummary {
	    job: Job;
	    stageSince: string;
	    daysInStage: number;
	    stale: boolean;
	    followUpDue: boolean;
	    nextInterview?: Interview;
	    offerYear1Total?: number;
	
	    static createFrom(source: any = {}) {
	        return new JobSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.job = this.convertValues(source["job"], Job);
	        this.stageSince = source["stageSince"];
	        this.daysInStage = source["daysInStage"];
	        this.stale = source["stale"];
	        this.followUpDue = source["followUpDue"];
	        this.nextInterview = this.convertValues(source["nextInterview"], Interview);
	        this.offerYear1Total = source["offerYear1Total"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class LiveCues {
	    start: string;
	    wrapUp: string;
	    wrapUpAtMs: number;
	    timeUp: string;
	    timeUpAtMs: number;
	    rejoin: string;
	
	    static createFrom(source: any = {}) {
	        return new LiveCues(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.start = source["start"];
	        this.wrapUp = source["wrapUp"];
	        this.wrapUpAtMs = source["wrapUpAtMs"];
	        this.timeUp = source["timeUp"];
	        this.timeUpAtMs = source["timeUpAtMs"];
	        this.rejoin = source["rejoin"];
	    }
	}
	export class LiveSession {
	    sessionId: string;
	    token: string;
	    wsUrl: string;
	    setup: Record<string, any>;
	    minutes: number;
	    kind: string;
	    company: string;
	    position: string;
	    voice: string;
	    interviewerName: string;
	    cues: LiveCues;
	
	    static createFrom(source: any = {}) {
	        return new LiveSession(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sessionId = source["sessionId"];
	        this.token = source["token"];
	        this.wsUrl = source["wsUrl"];
	        this.setup = source["setup"];
	        this.minutes = source["minutes"];
	        this.kind = source["kind"];
	        this.company = source["company"];
	        this.position = source["position"];
	        this.voice = source["voice"];
	        this.interviewerName = source["interviewerName"];
	        this.cues = this.convertValues(source["cues"], LiveCues);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	export class NextUp {
	    interview: Interview;
	    company: string;
	    position: string;
	
	    static createFrom(source: any = {}) {
	        return new NextUp(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.interview = this.convertValues(source["interview"], Interview);
	        this.company = source["company"];
	        this.position = source["position"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Metrics {
	    active: number;
	    responseRate?: number;
	    respondedCount: number;
	    appliedCount: number;
	    interviewsThisWeek: number;
	    followUpsDue: number;
	    nextUp?: NextUp;
	
	    static createFrom(source: any = {}) {
	        return new Metrics(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.active = source["active"];
	        this.responseRate = source["responseRate"];
	        this.respondedCount = source["respondedCount"];
	        this.appliedCount = source["appliedCount"];
	        this.interviewsThisWeek = source["interviewsThisWeek"];
	        this.followUpsDue = source["followUpsDue"];
	        this.nextUp = this.convertValues(source["nextUp"], NextUp);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class QuestionReview {
	    question: string;
	    answerSummary: string;
	    worked: string;
	    improve: string;
	    strongerAnswer: string;
	    planIndex?: number;
	
	    static createFrom(source: any = {}) {
	        return new QuestionReview(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.question = source["question"];
	        this.answerSummary = source["answerSummary"];
	        this.worked = source["worked"];
	        this.improve = source["improve"];
	        this.strongerAnswer = source["strongerAnswer"];
	        this.planIndex = source["planIndex"];
	    }
	}
	export class Scorecard {
	    overall: ScoreSet;
	    summary: string;
	    questions: QuestionReview[];
	    practiceNext: string[];
	
	    static createFrom(source: any = {}) {
	        return new Scorecard(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.overall = this.convertValues(source["overall"], ScoreSet);
	        this.summary = source["summary"];
	        this.questions = this.convertValues(source["questions"], QuestionReview);
	        this.practiceNext = source["practiceNext"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ScorecardResult {
	    provider: string;
	    model: string;
	    scorecard: Scorecard;
	    createdAt: string;
	
	    static createFrom(source: any = {}) {
	        return new ScorecardResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.provider = source["provider"];
	        this.model = source["model"];
	        this.scorecard = this.convertValues(source["scorecard"], Scorecard);
	        this.createdAt = source["createdAt"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class TranscriptLine {
	    speaker: string;
	    text: string;
	    atMs: number;
	    cutOff?: CutOff;
	
	    static createFrom(source: any = {}) {
	        return new TranscriptLine(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.speaker = source["speaker"];
	        this.text = source["text"];
	        this.atMs = source["atMs"];
	        this.cutOff = this.convertValues(source["cutOff"], CutOff);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class MockInterview {
	    id: string;
	    jobId: string;
	    company: string;
	    position: string;
	    kind: string;
	    minutes: number;
	    persona: string;
	    voice: string;
	    interviewerName: string;
	    focus: string;
	    status: string;
	    startedAt: string;
	    endedAt: string;
	    transcript: TranscriptLine[];
	    scorecards: ScorecardResult[];
	    scorecard?: Scorecard;
	    tips: InterviewTip[];
	    hasRecording: boolean;
	    error: string;
	    planId: string;
	    plan?: InterviewPlanRecord;
	    planError: string;
	    attempt: number;
	    attempts: AttemptSummary[];
	
	    static createFrom(source: any = {}) {
	        return new MockInterview(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.jobId = source["jobId"];
	        this.company = source["company"];
	        this.position = source["position"];
	        this.kind = source["kind"];
	        this.minutes = source["minutes"];
	        this.persona = source["persona"];
	        this.voice = source["voice"];
	        this.interviewerName = source["interviewerName"];
	        this.focus = source["focus"];
	        this.status = source["status"];
	        this.startedAt = source["startedAt"];
	        this.endedAt = source["endedAt"];
	        this.transcript = this.convertValues(source["transcript"], TranscriptLine);
	        this.scorecards = this.convertValues(source["scorecards"], ScorecardResult);
	        this.scorecard = this.convertValues(source["scorecard"], Scorecard);
	        this.tips = this.convertValues(source["tips"], InterviewTip);
	        this.hasRecording = source["hasRecording"];
	        this.error = source["error"];
	        this.planId = source["planId"];
	        this.plan = this.convertValues(source["plan"], InterviewPlanRecord);
	        this.planError = source["planError"];
	        this.attempt = source["attempt"];
	        this.attempts = this.convertValues(source["attempts"], AttemptSummary);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class MockInterviewSummary {
	    id: string;
	    jobId: string;
	    company: string;
	    position: string;
	    kind: string;
	    minutes: number;
	    persona: string;
	    interviewerName: string;
	    status: string;
	    startedAt: string;
	    latestOverall?: ScoreSet;
	    graders: string[];
	    hasRecording: boolean;
	    hasTips: boolean;
	    hasPlan: boolean;
	    attempt: number;
	
	    static createFrom(source: any = {}) {
	        return new MockInterviewSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.jobId = source["jobId"];
	        this.company = source["company"];
	        this.position = source["position"];
	        this.kind = source["kind"];
	        this.minutes = source["minutes"];
	        this.persona = source["persona"];
	        this.interviewerName = source["interviewerName"];
	        this.status = source["status"];
	        this.startedAt = source["startedAt"];
	        this.latestOverall = this.convertValues(source["latestOverall"], ScoreSet);
	        this.graders = source["graders"];
	        this.hasRecording = source["hasRecording"];
	        this.hasTips = source["hasTips"];
	        this.hasPlan = source["hasPlan"];
	        this.attempt = source["attempt"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class Nudge {
	    nudge: string;
	    kind: string;
	
	    static createFrom(source: any = {}) {
	        return new Nudge(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.nudge = source["nudge"];
	        this.kind = source["kind"];
	    }
	}
	export class Option {
	    code: string;
	    title: string;
	    state: string;
	    type: string;
	
	    static createFrom(source: any = {}) {
	        return new Option(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.code = source["code"];
	        this.title = source["title"];
	        this.state = source["state"];
	        this.type = source["type"];
	    }
	}
	
	
	export class Posting {
	    id: string;
	    dedupeKey: string;
	    url: string;
	    title: string;
	    company: string;
	    location: string;
	    workMode: string;
	    salaryMin?: number;
	    salaryMax?: number;
	    salaryText: string;
	    annualized: boolean;
	    description: string;
	    datePosted: string;
	    sources: string[];
	    state: string;
	    jobId: string;
	    jobStatus: string;
	    searchId: string;
	    firstSeen: string;
	    lastSeen: string;
	    dismissedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new Posting(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.dedupeKey = source["dedupeKey"];
	        this.url = source["url"];
	        this.title = source["title"];
	        this.company = source["company"];
	        this.location = source["location"];
	        this.workMode = source["workMode"];
	        this.salaryMin = source["salaryMin"];
	        this.salaryMax = source["salaryMax"];
	        this.salaryText = source["salaryText"];
	        this.annualized = source["annualized"];
	        this.description = source["description"];
	        this.datePosted = source["datePosted"];
	        this.sources = source["sources"];
	        this.state = source["state"];
	        this.jobId = source["jobId"];
	        this.jobStatus = source["jobStatus"];
	        this.searchId = source["searchId"];
	        this.firstSeen = source["firstSeen"];
	        this.lastSeen = source["lastSeen"];
	        this.dismissedAt = source["dismissedAt"];
	    }
	}
	export class PostingFilter {
	    tab: string;
	    query: string;
	    source: string;
	    onlyNew: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PostingFilter(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.tab = source["tab"];
	        this.query = source["query"];
	        this.source = source["source"];
	        this.onlyNew = source["onlyNew"];
	    }
	}
	export class Profile {
	    resumeFileName: string;
	    resumePath: string;
	    resumeText: string;
	    updatedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new Profile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.resumeFileName = source["resumeFileName"];
	        this.resumePath = source["resumePath"];
	        this.resumeText = source["resumeText"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	
	
	export class SavedSearch {
	    id: string;
	    term: string;
	    location: string;
	    remoteOnly: boolean;
	    sources: string[];
	    perSource: Record<string, number>;
	    lastRunAt: string;
	    createdAt: string;
	
	    static createFrom(source: any = {}) {
	        return new SavedSearch(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.term = source["term"];
	        this.location = source["location"];
	        this.remoteOnly = source["remoteOnly"];
	        this.sources = source["sources"];
	        this.perSource = source["perSource"];
	        this.lastRunAt = source["lastRunAt"];
	        this.createdAt = source["createdAt"];
	    }
	}
	
	
	
	
	export class SearchQuery {
	    term: string;
	    location: string;
	    remoteOnly: boolean;
	    sources: string[];
	    perSource: Record<string, number>;
	
	    static createFrom(source: any = {}) {
	        return new SearchQuery(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.term = source["term"];
	        this.location = source["location"];
	        this.remoteOnly = source["remoteOnly"];
	        this.sources = source["sources"];
	        this.perSource = source["perSource"];
	    }
	}
	export class SearchRun {
	    searchId: string;
	    cached: boolean;
	    fetched: number;
	    newCount: number;
	    errors: Record<string, string>;
	    lastRunAt: string;
	
	    static createFrom(source: any = {}) {
	        return new SearchRun(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.searchId = source["searchId"];
	        this.cached = source["cached"];
	        this.fetched = source["fetched"];
	        this.newCount = source["newCount"];
	        this.errors = source["errors"];
	        this.lastRunAt = source["lastRunAt"];
	    }
	}
	export class Settings {
	    adzunaAppId: string;
	    adzunaAppKey: string;
	    pythonPath: string;
	    followUpDays: number;
	    filingStatus: string;
	    homeAreaCode: string;
	    defaultOccupation: string;
	    usajobsKey: string;
	    usajobsEmail: string;
	    museCategories: string[];
	    geminiKey: string;
	    geminiLiveModel: string;
	    gradingProvider: string;
	    tipsProvider: string;
	    planProvider: string;
	    anthropicKey: string;
	    anthropicModel: string;
	    anthropicGradingEffort: string;
	    anthropicTipsEffort: string;
	    claudeCodePath: string;
	    claudeCodeModel: string;
	    openaiKey: string;
	    openaiModel: string;
	    deepseekKey: string;
	    deepseekModel: string;
	    ollamaURL: string;
	    ollamaModel: string;
	    customAIBaseURL: string;
	    customAIKey: string;
	    customAIModel: string;
	    customAIMode: string;
	    discoverCacheHours: number;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.adzunaAppId = source["adzunaAppId"];
	        this.adzunaAppKey = source["adzunaAppKey"];
	        this.pythonPath = source["pythonPath"];
	        this.followUpDays = source["followUpDays"];
	        this.filingStatus = source["filingStatus"];
	        this.homeAreaCode = source["homeAreaCode"];
	        this.defaultOccupation = source["defaultOccupation"];
	        this.usajobsKey = source["usajobsKey"];
	        this.usajobsEmail = source["usajobsEmail"];
	        this.museCategories = source["museCategories"];
	        this.geminiKey = source["geminiKey"];
	        this.geminiLiveModel = source["geminiLiveModel"];
	        this.gradingProvider = source["gradingProvider"];
	        this.tipsProvider = source["tipsProvider"];
	        this.planProvider = source["planProvider"];
	        this.anthropicKey = source["anthropicKey"];
	        this.anthropicModel = source["anthropicModel"];
	        this.anthropicGradingEffort = source["anthropicGradingEffort"];
	        this.anthropicTipsEffort = source["anthropicTipsEffort"];
	        this.claudeCodePath = source["claudeCodePath"];
	        this.claudeCodeModel = source["claudeCodeModel"];
	        this.openaiKey = source["openaiKey"];
	        this.openaiModel = source["openaiModel"];
	        this.deepseekKey = source["deepseekKey"];
	        this.deepseekModel = source["deepseekModel"];
	        this.ollamaURL = source["ollamaURL"];
	        this.ollamaModel = source["ollamaModel"];
	        this.customAIBaseURL = source["customAIBaseURL"];
	        this.customAIKey = source["customAIKey"];
	        this.customAIModel = source["customAIModel"];
	        this.customAIMode = source["customAIMode"];
	        this.discoverCacheHours = source["discoverCacheHours"];
	    }
	}
	
	export class StageEvent {
	    id: string;
	    jobId: string;
	    fromStatus: string;
	    toStatus: string;
	    closeReason: string;
	    at: string;
	    note: string;
	
	    static createFrom(source: any = {}) {
	        return new StageEvent(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.jobId = source["jobId"];
	        this.fromStatus = source["fromStatus"];
	        this.toStatus = source["toStatus"];
	        this.closeReason = source["closeReason"];
	        this.at = source["at"];
	        this.note = source["note"];
	    }
	}
	
	
	export class VoiceOption {
	    name: string;
	    style: string;
	    gender: string;
	
	    static createFrom(source: any = {}) {
	        return new VoiceOption(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.style = source["style"];
	        this.gender = source["gender"];
	    }
	}

}

