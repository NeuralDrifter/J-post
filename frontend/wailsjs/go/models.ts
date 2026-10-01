export namespace main {
	
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
	export class DiscoverQuery {
	    term: string;
	    location: string;
	    remoteOnly: boolean;
	    sources: string[];
	
	    static createFrom(source: any = {}) {
	        return new DiscoverQuery(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.term = source["term"];
	        this.location = source["location"];
	        this.remoteOnly = source["remoteOnly"];
	        this.sources = source["sources"];
	    }
	}
	export class DiscoverResult {
	    key: string;
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
	    url: string;
	    sources: string[];
	    trackedJobId: string;
	    trackedStatus: string;
	
	    static createFrom(source: any = {}) {
	        return new DiscoverResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
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
	        this.url = source["url"];
	        this.sources = source["sources"];
	        this.trackedJobId = source["trackedJobId"];
	        this.trackedStatus = source["trackedStatus"];
	    }
	}
	export class DiscoverResponse {
	    results: DiscoverResult[];
	    errors: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new DiscoverResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.results = this.convertValues(source["results"], DiscoverResult);
	        this.errors = source["errors"];
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
	export class JobSummary {
	    job: Job;
	    stageSince: string;
	    daysInStage: number;
	    stale: boolean;
	    followUpDue: boolean;
	    nextInterview?: Interview;
	
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
	
	export class Settings {
	    adzunaAppId: string;
	    adzunaAppKey: string;
	    pythonPath: string;
	    followUpDays: number;
	    windowWidth: number;
	    windowHeight: number;
	    windowMaximised: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.adzunaAppId = source["adzunaAppId"];
	        this.adzunaAppKey = source["adzunaAppKey"];
	        this.pythonPath = source["pythonPath"];
	        this.followUpDays = source["followUpDays"];
	        this.windowWidth = source["windowWidth"];
	        this.windowHeight = source["windowHeight"];
	        this.windowMaximised = source["windowMaximised"];
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

}

