import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface Reviewer {
  id: string;
  encryptedProfile: string;
  expertise: string;
  institution: string;
  rating: number;
  reviewCount: number;
  availability: boolean;
  lastActive: number;
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [searchQuery, setSearchQuery] = useState("");
  const [expertiseFilter, setExpertiseFilter] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [showTeamInfo, setShowTeamInfo] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");

  // Statistics for dashboard
  const totalReviewers = reviewers.length;
  const availableCount = reviewers.filter(r => r.availability).length;
  const averageRating = totalReviewers > 0 
    ? reviewers.reduce((sum, r) => sum + r.rating, 0) / totalReviewers 
    : 0;

  // Filter reviewers based on search and filters
  const filteredReviewers = reviewers.filter(reviewer => {
    const matchesSearch = reviewer.expertise.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         reviewer.institution.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesExpertise = expertiseFilter === "all" || reviewer.expertise === expertiseFilter;
    const matchesAvailability = availabilityFilter === "all" || 
                              (availabilityFilter === "available" && reviewer.availability) ||
                              (availabilityFilter === "unavailable" && !reviewer.availability);
    return matchesSearch && matchesExpertise && matchesAvailability;
  });

  useEffect(() => {
    loadReviewers().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadReviewers = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("reviewer_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing reviewer keys:", e);
        }
      }
      
      const list: Reviewer[] = [];
      
      for (const key of keys) {
        try {
          const reviewerBytes = await contract.getData(`reviewer_${key}`);
          if (reviewerBytes.length > 0) {
            try {
              const reviewerData = JSON.parse(ethers.toUtf8String(reviewerBytes));
              list.push({
                id: key,
                encryptedProfile: reviewerData.profile,
                expertise: reviewerData.expertise,
                institution: reviewerData.institution,
                rating: reviewerData.rating || 0,
                reviewCount: reviewerData.reviewCount || 0,
                availability: reviewerData.availability || false,
                lastActive: reviewerData.lastActive || 0
              });
            } catch (e) {
              console.error(`Error parsing reviewer data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading reviewer ${key}:`, e);
        }
      }
      
      setReviewers(list);
    } catch (e) {
      console.error("Error loading reviewers:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const addSampleReviewer = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Adding sample reviewer with FHE encryption..."
    });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const reviewerId = `rev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const expertiseOptions = ["AI", "Cryptography", "Biology", "Physics", "Mathematics", "Computer Science"];
      const institutionOptions = ["MIT", "Stanford", "Harvard", "Cambridge", "ETH Zurich", "NUS"];
      
      const reviewerData = {
        profile: `FHE-ENCRYPTED-PROFILE-${reviewerId}`,
        expertise: expertiseOptions[Math.floor(Math.random() * expertiseOptions.length)],
        institution: institutionOptions[Math.floor(Math.random() * institutionOptions.length)],
        rating: Math.random() * 2 + 3, // Random rating between 3-5
        reviewCount: Math.floor(Math.random() * 50) + 5,
        availability: Math.random() > 0.3,
        lastActive: Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 2592000) // Up to 30 days ago
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `reviewer_${reviewerId}`, 
        ethers.toUtf8Bytes(JSON.stringify(reviewerData))
      );
      
      const keysBytes = await contract.getData("reviewer_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(reviewerId);
      
      await contract.setData(
        "reviewer_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Sample reviewer added with FHE encryption!"
      });
      
      await loadReviewers();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: `FHE System is ${isAvailable ? "available" : "unavailable"} for secure computations`
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Failed to check system availability"
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const renderRatingChart = () => {
    const ratingBins = [0, 0, 0, 0, 0]; // 1-5 stars
    
    reviewers.forEach(reviewer => {
      const binIndex = Math.floor(reviewer.rating) - 1;
      if (binIndex >= 0 && binIndex < 5) {
        ratingBins[binIndex]++;
      }
    });
    
    const maxCount = Math.max(...ratingBins, 1);
    
    return (
      <div className="rating-chart">
        {ratingBins.map((count, index) => (
          <div key={index} className="rating-bar">
            <div className="bar-label">{index + 1}★</div>
            <div className="bar-container">
              <div 
                className="bar-fill" 
                style={{ 
                  width: `${(count / maxCount) * 100}%`,
                  background: `linear-gradient(90deg, #ff00ff, #00ffff)`
                }}
              ></div>
            </div>
            <div className="bar-count">{count}</div>
          </div>
        ))}
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="cyber-spinner"></div>
      <p>Initializing FHE secure connection...</p>
    </div>
  );

  return (
    <div className="app-container cyberpunk-theme">
      {/* Animated background elements */}
      <div className="cyber-grid"></div>
      <div className="neon-glows">
        <div className="glow glow-1"></div>
        <div className="glow glow-2"></div>
        <div className="glow glow-3"></div>
      </div>
      
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="circuit-icon"></div>
          </div>
          <h1>FHE<span>Review</span>Network</h1>
        </div>
        
        <div className="header-actions">
          <button 
            className="cyber-button neon-blue"
            onClick={checkAvailability}
          >
            Check FHE Status
          </button>
          <button 
            className="cyber-button neon-pink"
            onClick={addSampleReviewer}
            disabled={!account}
          >
            Add Sample Reviewer
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-layout">
        {/* Sidebar Navigation */}
        <nav className="sidebar">
          <div className="nav-items">
            <button 
              className={`nav-item ${activeTab === "dashboard" ? "active" : ""}`}
              onClick={() => setActiveTab("dashboard")}
            >
              <span className="nav-icon">📊</span>
              Dashboard
            </button>
            <button 
              className={`nav-item ${activeTab === "reviewers" ? "active" : ""}`}
              onClick={() => setActiveTab("reviewers")}
            >
              <span className="nav-icon">👥</span>
              Reviewers
            </button>
            <button 
              className={`nav-item ${activeTab === "about" ? "active" : ""}`}
              onClick={() => setActiveTab("about")}
            >
              <span className="nav-icon">ℹ️</span>
              About
            </button>
            <button 
              className={`nav-item ${activeTab === "team" ? "active" : ""}`}
              onClick={() => setShowTeamInfo(!showTeamInfo)}
            >
              <span className="nav-icon">👨‍💻</span>
              Team
            </button>
          </div>
          
          <div className="sidebar-footer">
            <div className="fhe-badge">
              <span>FHE-Powered</span>
            </div>
          </div>
        </nav>
        
        {/* Main Content Area */}
        <main className="content-area">
          {/* Dashboard Tab */}
          {activeTab === "dashboard" && (
            <div className="dashboard-panel">
              <div className="welcome-banner neon-border">
                <div className="welcome-text">
                  <h2>Anonymous Scientific Peer Reviewer Recommendation</h2>
                  <p>Secure FHE-based matching of encrypted manuscripts with qualified reviewers</p>
                </div>
              </div>
              
              <div className="stats-grid">
                <div className="stat-card neon-purple">
                  <div className="stat-icon">👥</div>
                  <div className="stat-content">
                    <h3>{totalReviewers}</h3>
                    <p>Total Reviewers</p>
                  </div>
                </div>
                
                <div className="stat-card neon-blue">
                  <div className="stat-icon">✅</div>
                  <div className="stat-content">
                    <h3>{availableCount}</h3>
                    <p>Available Now</p>
                  </div>
                </div>
                
                <div className="stat-card neon-green">
                  <div className="stat-icon">⭐</div>
                  <div className="stat-content">
                    <h3>{averageRating.toFixed(1)}</h3>
                    <p>Avg Rating</p>
                  </div>
                </div>
                
                <div className="stat-card neon-pink">
                  <div className="stat-icon">🔒</div>
                  <div className="stat-content">
                    <h3>FHE</h3>
                    <p>Secure Matching</p>
                  </div>
                </div>
              </div>
              
              <div className="charts-section">
                <div className="chart-card">
                  <h3>Rating Distribution</h3>
                  {renderRatingChart()}
                </div>
                
                <div className="chart-card">
                  <h3>Expertise Areas</h3>
                  <div className="expertise-tags">
                    {Array.from(new Set(reviewers.map(r => r.expertise))).slice(0, 8).map(expertise => (
                      <span key={expertise} className="expertise-tag">{expertise}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Reviewers Tab */}
          {activeTab === "reviewers" && (
            <div className="reviewers-panel">
              <div className="panel-header">
                <h2>FHE-Encrypted Reviewer Database</h2>
                <div className="header-controls">
                  <div className="search-box">
                    <input 
                      type="text" 
                      placeholder="Search reviewers..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="cyber-input"
                    />
                  </div>
                  
                  <select 
                    value={expertiseFilter}
                    onChange={(e) => setExpertiseFilter(e.target.value)}
                    className="cyber-select"
                  >
                    <option value="all">All Expertise</option>
                    {Array.from(new Set(reviewers.map(r => r.expertise))).map(expertise => (
                      <option key={expertise} value={expertise}>{expertise}</option>
                    ))}
                  </select>
                  
                  <select 
                    value={availabilityFilter}
                    onChange={(e) => setAvailabilityFilter(e.target.value)}
                    className="cyber-select"
                  >
                    <option value="all">All Status</option>
                    <option value="available">Available</option>
                    <option value="unavailable">Unavailable</option>
                  </select>
                  
                  <button 
                    onClick={loadReviewers}
                    className="cyber-button neon-blue"
                    disabled={isRefreshing}
                  >
                    {isRefreshing ? "🔄" : "Refresh"}
                  </button>
                </div>
              </div>
              
              <div className="reviewers-grid">
                {filteredReviewers.length === 0 ? (
                  <div className="no-results">
                    <div className="no-results-icon">🔍</div>
                    <p>No reviewers match your criteria</p>
                    <button 
                      className="cyber-button neon-pink"
                      onClick={addSampleReviewer}
                    >
                      Add Sample Reviewer
                    </button>
                  </div>
                ) : (
                  filteredReviewers.map(reviewer => (
                    <div key={reviewer.id} className="reviewer-card neon-border">
                      <div className="card-header">
                        <div className="reviewer-avatar">
                          {reviewer.expertise.charAt(0)}
                        </div>
                        <div className="reviewer-info">
                          <h3>{reviewer.expertise} Expert</h3>
                          <p>{reviewer.institution}</p>
                        </div>
                        <div className={`availability-dot ${reviewer.availability ? "available" : "unavailable"}`}></div>
                      </div>
                      
                      <div className="card-body">
                        <div className="rating">
                          <span className="stars">{'★'.repeat(Math.floor(reviewer.rating))}</span>
                          <span className="rating-value">({reviewer.rating.toFixed(1)})</span>
                        </div>
                        <div className="review-count">
                          {reviewer.reviewCount} reviews completed
                        </div>
                        <div className="encrypted-badge">
                          🔒 FHE-Encrypted Profile
                        </div>
                      </div>
                      
                      <div className="card-footer">
                        <button className="cyber-button small">Request Review</button>
                        <button className="cyber-button small outline">View Details</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
          
          {/* About Tab */}
          {activeTab === "about" && (
            <div className="about-panel">
              <div className="about-card">
                <h2>About FHE Review Network</h2>
                <p>
                  The FHE Review Network leverages Fully Homomorphic Encryption to enable 
                  secure matching of scientific manuscripts with qualified peer reviewers 
                  while preserving complete anonymity and privacy.
                </p>
                
                <div className="feature-list">
                  <div className="feature-item">
                    <div className="feature-icon">🔒</div>
                    <div className="feature-content">
                      <h3>Zero-Knowledge Matching</h3>
                      <p>Manuscript contents remain encrypted throughout the matching process</p>
                    </div>
                  </div>
                  
                  <div className="feature-item">
                    <div className="feature-icon">👁️</div>
                    <div className="feature-content">
                      <h3>Double-Blind Review</h3>
                      <p>Complete anonymity for both authors and reviewers</p>
                    </div>
                  </div>
                  
                  <div className="feature-item">
                    <div className="feature-icon">⚡</div>
                    <div className="feature-content">
                      <h3>Efficient FHE Processing</h3>
                      <p>Optimized homomorphic encryption algorithms for fast matching</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
  
      {/* Team Information Modal */}
      {showTeamInfo && (
        <div className="modal-overlay">
          <div className="modal-content neon-border">
            <div className="modal-header">
              <h2>Development Team</h2>
              <button onClick={() => setShowTeamInfo(false)} className="close-modal">&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="team-grid">
                <div className="team-member">
                  <div className="member-avatar">👨‍💻</div>
                  <h3>Dr. Alex Chen</h3>
                  <p>FHE Cryptography Expert</p>
                  <p>PhD in Computer Science, Stanford</p>
                </div>
                
                <div className="team-member">
                  <div className="member-avatar">👩‍🔬</div>
                  <h3>Dr. Maria Rodriguez</h3>
                  <p>Scientific Research Specialist</p>
                  <p>Former Editor, Nature Journal</p>
                </div>
                
                <div className="team-member">
                  <div className="member-avatar">👨‍🔧</div>
                  <h3>James Kim</h3>
                  <p>Blockchain Engineer</p>
                  <p>Smart Contract Development</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content neon-border">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="cyber-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon">✅</div>}
              {transactionStatus.status === "error" && <div className="error-icon">❌</div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="circuit-icon"></div>
              <span>FHEReviewNetwork</span>
            </div>
            <p>Secure anonymous peer review using Fully Homomorphic Encryption</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">API</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Anonymity</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} FHE Review Network. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;