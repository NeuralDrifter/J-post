import sys
import json
from jobspy import scrape_jobs

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python scraper.py <search_term> <location>"}))
        return

    search_term = sys.argv[1]
    location = sys.argv[2]
    
    try:
        jobs = scrape_jobs(
            site_name=["indeed", "linkedin", "zip_recruiter"],
            search_term=search_term,
            location=location,
            results_wanted=10,
            country_indeed='USA'
        )
        
        jobs = jobs.fillna("")
        
        results = []
        for _, row in jobs.iterrows():
            results.append({
                "company": str(row.get("company", "")),
                "position": str(row.get("title", "")),
                "url": str(row.get("job_url", "")),
                "site": str(row.get("site", "")),
                "location": f"{row.get('city', '')}, {row.get('state', '')}".strip(', ')
            })
            
        print(json.dumps(results))
    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    main()
