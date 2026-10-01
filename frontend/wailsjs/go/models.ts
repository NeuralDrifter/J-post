export namespace main {
	
	export class JobApplication {
	    id: string;
	    company: string;
	    position: string;
	    status: string;
	    dateApplied: string;
	    notes: string;
	    // Go type: time
	    updatedAt: any;
	
	    static createFrom(source: any = {}) {
	        return new JobApplication(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.company = source["company"];
	        this.position = source["position"];
	        this.status = source["status"];
	        this.dateApplied = source["dateApplied"];
	        this.notes = source["notes"];
	        this.updatedAt = this.convertValues(source["updatedAt"], null);
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
	export class ScrapedJob {
	    company: string;
	    position: string;
	    url: string;
	    site: string;
	    location: string;
	
	    static createFrom(source: any = {}) {
	        return new ScrapedJob(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.company = source["company"];
	        this.position = source["position"];
	        this.url = source["url"];
	        this.site = source["site"];
	        this.location = source["location"];
	    }
	}
	export class Settings {
	    adzunaAppId: string;
	    adzunaAppKey: string;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.adzunaAppId = source["adzunaAppId"];
	        this.adzunaAppKey = source["adzunaAppKey"];
	    }
	}

}

