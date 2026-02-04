// =============================================
// PASSWORD GATE - DREAM WEAVER AUTHENTICATION
// =============================================

class PasswordGate {
    constructor() {
        this.correctPassword = 'weaver';
        this.storageKey = 'globaldeets_auth';
        this.init();
    }
    
    init() {
        // Check if already authenticated
        if (this.isAuthenticated()) {
            this.unlockSite();
        } else {
            this.showGate();
        }
    }
    
    isAuthenticated() {
        const auth = sessionStorage.getItem(this.storageKey);
        return auth === 'true';
    }
    
    showGate() {
        // Hide main content
        document.body.style.overflow = 'hidden';
        
        // Create gate overlay
        const gate = document.createElement('div');
        gate.id = 'password-gate';
        gate.innerHTML = `
            <div class="gate-container">
                <div class="gate-content">
                    <div class="gate-logo">
                        <div class="logo-circle">🔒</div>
                    </div>
                    <h1 class="gate-title">GlobalDeets</h1>
                    <p class="gate-subtitle">Exclusive Intelligence Platform</p>
                    
                    <div class="gate-form">
                        <label class="gate-label">Dream _____</label>
                        <input 
                            type="text" 
                            id="password-input" 
                            class="gate-input" 
                            placeholder="Enter password"
                            autocomplete="off"
                            spellcheck="false"
                        />
                        <button id="submit-password" class="gate-button">
                            Unlock
                        </button>
                        <div id="error-message" class="gate-error"></div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(gate);
        
        // Add styles
        this.addStyles();
        
        // Attach event listeners
        this.attachListeners();
        
        // Focus input
        setTimeout(() => {
            document.getElementById('password-input').focus();
        }, 100);
    }
    
    addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #password-gate {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: var(--bg-void, #050911);
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
                animation: gateAppear 0.5s ease-out;
            }
            
            @keyframes gateAppear {
                from {
                    opacity: 0;
                }
                to {
                    opacity: 1;
                }
            }
            
            .gate-container {
                max-width: 500px;
                width: 90%;
                padding: 2rem;
            }
            
            .gate-content {
                background: rgba(20, 30, 50, 0.4);
                backdrop-filter: blur(24px) saturate(180%);
                -webkit-backdrop-filter: blur(24px) saturate(180%);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 24px;
                padding: 3rem 2.5rem;
                text-align: center;
                box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
            }
            
            .gate-logo {
                margin-bottom: 2rem;
            }
            
            .logo-circle {
                width: 80px;
                height: 80px;
                background: linear-gradient(135deg, #3b82f6, #8b5cf6);
                border-radius: 50%;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 2.5rem;
                box-shadow: 0 8px 24px rgba(59, 130, 246, 0.4);
                animation: pulse 2s ease-in-out infinite;
            }
            
            @keyframes pulse {
                0%, 100% {
                    transform: scale(1);
                    box-shadow: 0 8px 24px rgba(59, 130, 246, 0.4);
                }
                50% {
                    transform: scale(1.05);
                    box-shadow: 0 12px 32px rgba(59, 130, 246, 0.6);
                }
            }
            
            .gate-title {
                font-size: 2.5rem;
                font-weight: 800;
                background: linear-gradient(135deg, #60a5fa 0%, #8b5cf6 50%, #ec4899 100%);
                background-size: 200% 200%;
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                margin-bottom: 0.5rem;
                animation: gradientShift 8s ease infinite;
            }
            
            @keyframes gradientShift {
                0%, 100% { background-position: 0% 50%; }
                50% { background-position: 100% 50%; }
            }
            
            .gate-subtitle {
                color: #cbd5e1;
                font-size: 1rem;
                margin-bottom: 2.5rem;
                opacity: 0.8;
            }
            
            .gate-form {
                margin-top: 2rem;
            }
            
            .gate-label {
                display: block;
                font-size: 1.2rem;
                font-weight: 600;
                color: #f0f4f8;
                margin-bottom: 1rem;
                letter-spacing: 0.5px;
            }
            
            .gate-input {
                width: 100%;
                padding: 1rem 1.5rem;
                background: rgba(30, 45, 70, 0.5);
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 12px;
                color: #f0f4f8;
                font-size: 1rem;
                font-family: inherit;
                margin-bottom: 1rem;
                transition: all 0.3s ease;
                text-align: center;
                letter-spacing: 1px;
            }
            
            .gate-input:focus {
                outline: none;
                border-color: #3b82f6;
                background: rgba(30, 45, 70, 0.7);
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
            }
            
            .gate-input::placeholder {
                color: #64748b;
            }
            
            .gate-button {
                width: 100%;
                padding: 1rem 2rem;
                background: linear-gradient(135deg, #3b82f6, #8b5cf6);
                border: none;
                border-radius: 12px;
                color: white;
                font-size: 1rem;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.3s ease;
                text-transform: uppercase;
                letter-spacing: 1px;
                box-shadow: 0 8px 24px rgba(59, 130, 246, 0.4);
            }
            
            .gate-button:hover {
                transform: translateY(-2px);
                box-shadow: 0 12px 32px rgba(59, 130, 246, 0.6);
            }
            
            .gate-button:active {
                transform: translateY(0);
            }
            
            .gate-error {
                margin-top: 1rem;
                color: #ef4444;
                font-size: 0.9rem;
                min-height: 1.5rem;
                font-weight: 500;
            }
            
            .gate-unlock {
                animation: gateUnlock 0.6s ease-out forwards;
            }
            
            @keyframes gateUnlock {
                0% {
                    opacity: 1;
                    transform: scale(1);
                }
                100% {
                    opacity: 0;
                    transform: scale(1.1);
                }
            }
            
            /* Shake animation for wrong password */
            .shake {
                animation: shake 0.5s ease;
            }
            
            @keyframes shake {
                0%, 100% { transform: translateX(0); }
                25% { transform: translateX(-10px); }
                75% { transform: translateX(10px); }
            }
        `;
        
        document.head.appendChild(style);
    }
    
    attachListeners() {
        const input = document.getElementById('password-input');
        const button = document.getElementById('submit-password');
        const errorMsg = document.getElementById('error-message');
        
        const checkPassword = () => {
            const entered = input.value.toLowerCase().trim();
            
            if (entered === this.correctPassword) {
                // Correct password
                errorMsg.textContent = '';
                this.authenticate();
            } else {
                // Wrong password
                errorMsg.textContent = 'Incorrect password. Try again.';
                input.value = '';
                input.classList.add('shake');
                setTimeout(() => {
                    input.classList.remove('shake');
                }, 500);
                input.focus();
            }
        };
        
        button.addEventListener('click', checkPassword);
        
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                checkPassword();
            }
        });
    }
    
    authenticate() {
        sessionStorage.setItem(this.storageKey, 'true');
        
        const gate = document.getElementById('password-gate');
        gate.classList.add('gate-unlock');
        
        setTimeout(() => {
            this.unlockSite();
            gate.remove();
        }, 600);
    }
    
    unlockSite() {
        document.body.style.overflow = '';
        // Site content is already visible, just remove the gate
    }
}

// Initialize password gate when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new PasswordGate();
    });
} else {
    new PasswordGate();
}
