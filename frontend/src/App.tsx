import {useState, useEffect} from 'react';
import './App.css';
import {
    GetApplications, 
    AddApplication, 
    UpdateApplication, 
    DeleteApplication,
    GetSettings,
    SaveSettings,
    ScrapeJobs,
    AdzunaSearch
} from "../wailsjs/go/main/App";
import {main} from "../wailsjs/go/models";

function App() {
    const [apps, setApps] = useState<main.JobApplication[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const [currentApp, setCurrentApp] = useState<Partial<main.JobApplication>>({});
    
    const [showSettings, setShowSettings] = useState(false);
    const [settings, setSettings] = useState<main.Settings>(new main.Settings());

    const [showSearch, setShowSearch] = useState(false);
    const [searchTerm, setSearchTerm] = useState("Software Engineer");
    const [searchLocation, setSearchLocation] = useState("Remote");
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<main.ScrapedJob[]>([]);

    useEffect(() => {
        loadApps();
        loadSettings();
    }, []);

    const loadApps = async () => {
        try {
            const data = await GetApplications();
            setApps(data || []);
        } catch (err) {
            console.error("Failed to load applications:", err);
        }
    };

    const loadSettings = async () => {
        try {
            const data = await GetSettings();
            if (data) setSettings(data);
        } catch (err) {
            console.error("Failed to load settings:", err);
        }
    };

    const handleSaveSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await SaveSettings(settings);
            setShowSettings(false);
        } catch (err) {
            console.error("Failed to save settings:", err);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (currentApp.id) {
                await UpdateApplication(currentApp as main.JobApplication);
            } else {
                await AddApplication(currentApp as main.JobApplication);
            }
            setIsEditing(false);
            setCurrentApp({});
            loadApps();
        } catch (err) {
            console.error("Failed to save application:", err);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this application?")) return;
        try {
            await DeleteApplication(id);
            loadApps();
        } catch (err) {
            console.error("Failed to delete:", err);
        }
    };

    const editApp = (app: main.JobApplication) => {
        setCurrentApp(app);
        setIsEditing(true);
    };

    const addNew = () => {
        setCurrentApp({ status: "Wishlist" });
        setIsEditing(true);
    };

    const performSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSearching(true);
        setSearchResults([]);
        
        try {
            // Run JobSpy
            const jobspyResults = await ScrapeJobs(searchTerm, searchLocation).catch(err => {
                console.error("JobSpy Error:", err);
                return [];
            });

            // Run Adzuna
            let adzunaResults: main.ScrapedJob[] = [];
            if (settings.adzunaAppId && settings.adzunaAppKey) {
                adzunaResults = await AdzunaSearch(searchTerm, searchLocation).catch(err => {
                    console.error("Adzuna Error:", err);
                    return [];
                });
            }

            setSearchResults([...(jobspyResults || []), ...(adzunaResults || [])]);
        } catch (err) {
            console.error("Search failed:", err);
        } finally {
            setIsSearching(false);
        }
    };

    const addToWishlist = async (job: main.ScrapedJob) => {
        try {
            await AddApplication({
                company: job.company,
                position: job.position,
                status: "Wishlist",
                dateApplied: "",
                notes: `Found on ${job.site}\nURL: ${job.url}\nLocation: ${job.location}`,
            } as main.JobApplication);
            alert("Added to Wishlist!");
            loadApps();
        } catch (err) {
            console.error("Failed to add from search:", err);
        }
    };

    if (showSettings) {
        return (
            <div className="container">
                <div className="header">
                    <h2>Settings</h2>
                </div>
                <form onSubmit={handleSaveSettings} className="form-container">
                    <p className="text-muted">Enter your API keys here. They are stored securely in a local file on your computer and never sent anywhere else.</p>
                    <div className="form-group">
                        <label>Adzuna App ID</label>
                        <input type="password" value={settings.adzunaAppId || ''} onChange={e => setSettings({...settings, adzunaAppId: e.target.value})} placeholder="Adzuna App ID" />
                    </div>
                    <div className="form-group">
                        <label>Adzuna App Key</label>
                        <input type="password" value={settings.adzunaAppKey || ''} onChange={e => setSettings({...settings, adzunaAppKey: e.target.value})} placeholder="Adzuna App Key" />
                    </div>
                    <div className="actions">
                        <button type="submit" className="btn primary">Save Settings</button>
                        <button type="button" className="btn secondary" onClick={() => setShowSettings(false)}>Cancel</button>
                    </div>
                </form>
            </div>
        );
    }

    if (showSearch) {
        return (
            <div className="container" style={{overflowY: 'auto'}}>
                <div className="header">
                    <h2>Search Jobs</h2>
                    <button className="btn secondary" onClick={() => setShowSearch(false)}>Back to Board</button>
                </div>
                <form onSubmit={performSearch} className="search-form">
                    <input required value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Job Title (e.g. Software Engineer)" />
                    <input required value={searchLocation} onChange={e => setSearchLocation(e.target.value)} placeholder="Location (e.g. Remote, New York)" />
                    <button type="submit" className="btn primary" disabled={isSearching}>
                        {isSearching ? 'Searching...' : 'Search'}
                    </button>
                </form>

                <div className="search-results">
                    {searchResults.length === 0 && !isSearching && <p className="text-muted text-center" style={{marginTop: '40px'}}>No results yet. Enter a search term above!</p>}
                    {searchResults.map((job, idx) => (
                        <div key={idx} className="search-card">
                            <div className="search-card-info">
                                <h4>{job.position} <span className="site-badge">{job.site}</span></h4>
                                <p><strong>{job.company}</strong> &bull; {job.location}</p>
                                <a href={job.url} target="_blank" rel="noreferrer" className="job-link">View Posting</a>
                            </div>
                            <button className="btn secondary" onClick={() => addToWishlist(job)}>+ Wishlist</button>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    const statuses = ["Wishlist", "Applied", "Interviewing", "Offer", "Rejected"];

    return (
        <div className="app-layout">
            <div className="top-nav">
                <div className="logo-section">
                    <h1>Job Tracker CRM</h1>
                </div>
                <div className="nav-actions">
                    <button className="btn nav-btn" onClick={() => setShowSearch(true)}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        Discover
                    </button>
                    <button className="btn nav-btn" onClick={() => setShowSettings(true)}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                    </button>
                    <button className="btn primary glow" onClick={addNew}>+ Add Application</button>
                </div>
            </div>
            
            <div className="board-scroll">
                <div className="board">
                    {statuses.map(status => (
                        <div key={status} className="column">
                            <div className="column-header">
                                <h3 className="column-title">{status}</h3>
                                <span className="badge">{apps.filter(a => a.status === status).length}</span>
                            </div>
                            <div className="cards">
                                {apps.filter(a => a.status === status).map(app => (
                                    <div key={app.id} className="card" onClick={() => editApp(app)}>
                                        <div className="card-header">
                                            <h4>{app.company}</h4>
                                            <button className="delete-btn" onClick={(e) => { e.stopPropagation(); handleDelete(app.id); }} title="Delete">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                            </button>
                                        </div>
                                        <div className="card-body">
                                            <p className="position">{app.position}</p>
                                            {app.dateApplied && <div className="date-tag">
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                                                {app.dateApplied}
                                            </div>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Modals */}
            {(isEditing || showSearch || showSettings) && (
                <div className="modal-backdrop" onClick={() => {setIsEditing(false); setShowSearch(false); setShowSettings(false);}}>
                    <div className={`modal-content ${showSearch ? 'search-modal' : ''}`} onClick={e => e.stopPropagation()}>
                        <button className="modal-close" onClick={() => {setIsEditing(false); setShowSearch(false); setShowSettings(false);}}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                        
                        {isEditing && (
                            <div className="modal-inner">
                                <h2>{currentApp.id ? 'Edit Application' : 'New Application'}</h2>
                                <form onSubmit={handleSave} className="form-container">
                                    <div className="form-group">
                                        <label>Company</label>
                                        <input required value={currentApp.company || ''} onChange={e => setCurrentApp({...currentApp, company: e.target.value})} placeholder="e.g. Google" />
                                    </div>
                                    <div className="form-group">
                                        <label>Position</label>
                                        <input required value={currentApp.position || ''} onChange={e => setCurrentApp({...currentApp, position: e.target.value})} placeholder="e.g. Senior Software Engineer" />
                                    </div>
                                    <div className="form-group">
                                        <label>Status</label>
                                        <select value={currentApp.status || 'Wishlist'} onChange={e => setCurrentApp({...currentApp, status: e.target.value})}>
                                            <option value="Wishlist">Wishlist</option>
                                            <option value="Applied">Applied</option>
                                            <option value="Interviewing">Interviewing</option>
                                            <option value="Offer">Offer</option>
                                            <option value="Rejected">Rejected</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Date Applied</label>
                                        <input type="date" value={currentApp.dateApplied || ''} onChange={e => setCurrentApp({...currentApp, dateApplied: e.target.value})} />
                                    </div>
                                    <div className="form-group">
                                        <label>Notes</label>
                                        <textarea value={currentApp.notes || ''} onChange={e => setCurrentApp({...currentApp, notes: e.target.value})} rows={4} placeholder="Interview notes, links, contacts..." />
                                    </div>
                                    <div className="actions">
                                        <button type="submit" className="btn primary full-width">Save Application</button>
                                    </div>
                                </form>
                            </div>
                        )}

                        {showSettings && (
                            <div className="modal-inner">
                                <h2>Settings</h2>
                                <form onSubmit={handleSaveSettings} className="form-container">
                                    <p className="text-muted">Enter your API keys here. They are stored securely in a local file on your computer and never sent anywhere else.</p>
                                    <div className="form-group">
                                        <label>Adzuna App ID</label>
                                        <input type="password" value={settings.adzunaAppId || ''} onChange={e => setSettings({...settings, adzunaAppId: e.target.value})} placeholder="Adzuna App ID" />
                                    </div>
                                    <div className="form-group">
                                        <label>Adzuna App Key</label>
                                        <input type="password" value={settings.adzunaAppKey || ''} onChange={e => setSettings({...settings, adzunaAppKey: e.target.value})} placeholder="Adzuna App Key" />
                                    </div>
                                    <div className="actions">
                                        <button type="submit" className="btn primary full-width">Save Settings</button>
                                    </div>
                                </form>
                            </div>
                        )}

                        {showSearch && (
                            <div className="modal-inner search-modal-inner">
                                <h2>Discover Jobs</h2>
                                <form onSubmit={performSearch} className="search-form">
                                    <div className="search-input-wrapper">
                                        <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                                        <input required value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Job Title" />
                                    </div>
                                    <div className="search-input-wrapper">
                                        <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                                        <input required value={searchLocation} onChange={e => setSearchLocation(e.target.value)} placeholder="Location" />
                                    </div>
                                    <button type="submit" className="btn primary" disabled={isSearching}>
                                        {isSearching ? <span className="spinner"></span> : 'Search'}
                                    </button>
                                </form>

                                <div className="search-results">
                                    {searchResults.length === 0 && !isSearching && <div className="empty-state">
                                        <div className="empty-icon">🔍</div>
                                        <p>No results yet. Discover new roles from LinkedIn, Indeed, and Adzuna.</p>
                                    </div>}
                                    {searchResults.map((job, idx) => (
                                        <div key={idx} className="search-card">
                                            <div className="search-card-info">
                                                <h4>{job.position} <span className="site-badge">{job.site}</span></h4>
                                                <p className="search-company">{job.company}</p>
                                                <div className="search-meta">
                                                    <span>
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                                                        {job.location || 'Remote'}
                                                    </span>
                                                    <a href={job.url} target="_blank" rel="noreferrer" className="job-link">
                                                        View Posting 
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                                                    </a>
                                                </div>
                                            </div>
                                            <button className="btn secondary add-btn" onClick={() => addToWishlist(job)} title="Add to Wishlist">
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

export default App
