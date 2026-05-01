document.addEventListener('DOMContentLoaded', () => {
    // ========================================
    // Carousel Logic (Mock)
    // ========================================
    const squares = Array.from(document.querySelectorAll('.carousel-indicators .square'));
    
    let currentIndex = 0; // Reference starts on the first slide
    
    function updateCarousel(index) {
        squares.forEach(sq => sq.classList.remove('active'));
        squares[index].classList.add('active');
        
        // Mock updating the counter text "03 /03//"
        const slideCurrent = document.querySelector('.slide-current');
        if (slideCurrent) {
            slideCurrent.textContent = String(index + 1).padStart(2, '0');
        }
    }
    
    squares.forEach((square, index) => {
        square.addEventListener('click', () => {
            currentIndex = index;
            updateCarousel(currentIndex);
        });
    });

    // ========================================
    // Sidebar Collapse Logic
    // ========================================
    const hamburger = document.querySelector('.hamburger');
    
    hamburger.addEventListener('click', () => {
        document.body.classList.toggle('sidebar-collapsed');
    });

    // ========================================
    // News Tabs Logic
    // ========================================
    const tabs = document.querySelectorAll('.news-tabs .tab');
    
    tabs.forEach((tab, index) => {
        tab.addEventListener('click', function() {
            // Remove active from all tabs
            tabs.forEach(t => t.classList.remove('active'));
            // Remove indicator from all tabs
            const existingIndicator = document.querySelector('.tab-indicator');
            if (existingIndicator) existingIndicator.remove();
            
            // Add active to clicked
            this.classList.add('active');
            
            // Add indicator back to clicked
            const indicator = document.createElement('div');
            indicator.className = 'tab-indicator';
            indicator.innerHTML = `<span class="arrow">➔</span><span class="number">${String(index + 1).padStart(2, '0')}</span>`;
            this.insertBefore(indicator, this.firstChild);
        });
    });

    // ========================================
    // Sidebar Navigation Logic
    // ========================================
    const navItems = document.querySelectorAll('.nav-list li');
    const navList = document.querySelector('.nav-list');
    
    let navIndicator = document.querySelector('.nav-indicator');
    if (!navIndicator && navList) {
        navIndicator = document.createElement('div');
        navIndicator.className = 'nav-indicator';
        navList.appendChild(navIndicator);
    }

    function updateNavIndicator(element) {
        if (!element || !navIndicator) return;
        const link = element.querySelector('a');
        const topPos = element.offsetTop + link.offsetTop + link.offsetHeight / 2;
        navIndicator.style.top = `${topPos}px`;
    }

    function createDecor(item) {
        const link = item.querySelector('a');
        const enText = link.getAttribute('data-en') || 'TEXT';
        const decor = document.createElement('div');
        decor.className = 'active-decor';
        decor.innerHTML = `
            <span class="decor-line left-line"></span>
            <span class="decor-text">${enText}</span>
            <span class="decor-line right-line"></span>
        `;
        return decor;
    }

    const initialActive = document.querySelector('.nav-list li.active');
    if (initialActive) {
        // Initial setup without transition
        navIndicator.style.transition = 'none';
        
        // Wait briefly for layout calculation
        setTimeout(() => {
            updateNavIndicator(initialActive);
            // Restore transition after setting initial position
            setTimeout(() => {
                navIndicator.style.transition = '';
            }, 50);
        }, 50);
    }

    let decorTimeout; // Store timeout ID to prevent overlap on rapid clicks

    function rollText(element, newText, direction = 1) {
        if (!element) return;
        
        // If an animation is already running on this element, fast-forward it
        if (element.rollTimeout) {
            clearTimeout(element.rollTimeout);
            element.innerHTML = '';
            element.textContent = element.targetText;
            element.rollTimeout = null;
        }

        if (element.textContent.trim() === newText) return;
        
        element.targetText = newText;
        const originalStyle = element.getAttribute('style') || '';
        const rect = element.getBoundingClientRect();
        const height = rect.height;
        
        const wrapper = document.createElement('span');
        wrapper.style.display = 'inline-flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.transition = 'transform 0.6s cubic-bezier(0.25, 1, 0.5, 1)';
        wrapper.style.verticalAlign = 'top';
        
        const oldSpan = document.createElement('span');
        oldSpan.textContent = element.textContent.trim();
        oldSpan.style.height = `${height}px`;
        oldSpan.style.display = 'flex';
        oldSpan.style.alignItems = 'center';
        oldSpan.style.justifyContent = 'center';
        oldSpan.style.whiteSpace = 'nowrap';
        
        const newSpan = document.createElement('span');
        newSpan.textContent = newText;
        newSpan.style.height = `${height}px`;
        newSpan.style.display = 'flex';
        newSpan.style.alignItems = 'center';
        newSpan.style.justifyContent = 'center';
        newSpan.style.whiteSpace = 'nowrap';

        if (direction === 1) {
            wrapper.appendChild(oldSpan);
            wrapper.appendChild(newSpan);
        } else {
            wrapper.appendChild(newSpan);
            wrapper.appendChild(oldSpan);
            wrapper.style.transform = `translateY(-${height}px)`;
        }
        
        const clipContainer = document.createElement('span');
        clipContainer.style.display = 'inline-flex';
        clipContainer.style.overflow = 'hidden';
        clipContainer.style.height = `${height}px`;
        clipContainer.style.verticalAlign = 'bottom';
        
        clipContainer.appendChild(wrapper);
        element.innerHTML = '';
        element.appendChild(clipContainer);
        
        void wrapper.offsetWidth;
        if (direction === 1) {
            wrapper.style.transform = `translateY(-${height}px)`;
        } else {
            wrapper.style.transform = `translateY(0)`;
        }
        
        element.rollTimeout = setTimeout(() => {
            element.innerHTML = '';
            element.textContent = newText;
            element.setAttribute('style', originalStyle);
            element.rollTimeout = null;
            element.targetText = null;
        }, 600);
    }

    navItems.forEach((item, index) => {
        const link = item.querySelector('a');
        link.addEventListener('click', (e) => {
            e.preventDefault();
            if (item.classList.contains('active')) return;

            // Trigger header lock cylinder animations
            const oldActive = document.querySelector('.nav-list li.active');
            let oldIndex = 0;
            navItems.forEach((li, idx) => {
                if (li === oldActive) oldIndex = idx;
            });
            const direction = index > oldIndex ? 1 : -1;

            const mainTitle = document.querySelector('.main-title');
            const subTitleText = document.querySelector('.sub-title-text');
            const eventNums = document.querySelectorAll('.event-num');
            
            const zhText = link.textContent.trim();
            const enText = link.getAttribute('data-en') || 'TEXT';
            const eventNumText = String(index + 1).padStart(2, '0');
            
            if (mainTitle) rollText(mainTitle, zhText, direction);
            if (subTitleText) rollText(subTitleText, enText, direction);
            eventNums.forEach(num => rollText(num, eventNumText, direction));

            // Clear any pending decor animations
            if (decorTimeout) {
                clearTimeout(decorTimeout);
            }

            // --- 1. Dry-run to calculate exact final top position ---
            // Disable transitions temporarily
            const style = document.createElement('style');
            style.innerHTML = '.nav-list li a { transition: none !important; }';
            document.head.appendChild(style);

            // Swap classes to get final layout
            if (oldActive) oldActive.classList.remove('active');
            item.classList.add('active');

            // Read final position
            const finalTop = item.offsetTop + link.offsetTop + link.offsetHeight / 2;

            // Revert classes back
            item.classList.remove('active');
            if (oldActive) oldActive.classList.add('active');

            // Force layout recalculation
            void document.body.offsetHeight;

            // Re-enable transitions
            document.head.removeChild(style);
            // ---------------------------------------------------------

            // --- 2. Actually perform the visual swap ---
            // Remove decor
            document.querySelectorAll('.active-decor').forEach(decor => decor.remove());
            if (oldActive) oldActive.classList.remove('active');
            item.classList.add('active');
            
            // Set indicator to exact final position
            if (navIndicator) {
                navIndicator.style.top = `${finalTop}px`;
            }

            // Handle page visibility
            const views = document.querySelectorAll('.page-view');
            views.forEach(view => view.classList.remove('active'));
            
            if (index === 0) {
                const homeView = document.getElementById('view-home');
                if (homeView) homeView.classList.add('active');
            } else if (index === 1) {
                const repoView = document.getElementById('view-repository');
                if (repoView) repoView.classList.add('active');
            } else if (index === 2) {
                const searchView = document.getElementById('view-search');
                if (searchView) searchView.classList.add('active');
            } else if (index === 3) {
                const qaView = document.getElementById('view-qa');
                if (qaView) qaView.classList.add('active');
            } else if (index === 4) {
                const profileView = document.getElementById('view-profile');
                if (profileView) profileView.classList.add('active');
            }

            // Wait for slower font-size transition to complete (0.6s)
            decorTimeout = setTimeout(() => {
                const decor = createDecor(item);
                item.appendChild(decor);
                
                void decor.offsetWidth;
                decor.classList.add('animate');
            }, 600);
        });
    });
    // ==========================================
    // Repo Pagination Logic
    // ==========================================
    const repoTrack = document.querySelector('.repo-track');
    const repoPrev = document.querySelector('.repo-btn.prev-btn');
    const repoNext = document.querySelector('.repo-btn.next-btn');
    const repoIndicator = document.querySelector('.repo-page-indicator');
    let currentRepoPage = 0;
    const totalRepoPages = 2;

    function updateRepoPagination() {
        if (!repoTrack) return;
        repoTrack.style.transform = `translateX(-${currentRepoPage * 50}%)`; // 50% because 2 pages
        
        if (repoIndicator) {
            repoIndicator.textContent = `0${currentRepoPage + 1} / 0${totalRepoPages}`;
        }
        
        if (repoPrev) repoPrev.classList.toggle('disabled', currentRepoPage === 0);
        if (repoNext) repoNext.classList.toggle('disabled', currentRepoPage === totalRepoPages - 1);
    }

    if (repoPrev && repoNext) {
        repoPrev.addEventListener('click', () => {
            if (currentRepoPage > 0) {
                currentRepoPage--;
                updateRepoPagination();
            }
        });

        repoNext.addEventListener('click', () => {
            if (currentRepoPage < totalRepoPages - 1) {
                currentRepoPage++;
                updateRepoPagination();
            }
        });
        updateRepoPagination(); // Init state
    }

    // ==========================================
    // Carousel Logic
    // ==========================================
    const carouselTrack = document.querySelector('.carousel-track');
    const carouselIndicators = document.querySelectorAll('.carousel-indicators .square');
    const slideCurrentText = document.querySelector('.slide-current');
    let currentSlide = 0;
    let carouselInterval;

    function goToSlide(index) {
        if (!carouselTrack) return;
        currentSlide = index;
        
        // Update track position
        const slideWidth = 100 / 3; // 3 slides
        carouselTrack.style.transform = `translateX(-${currentSlide * slideWidth}%)`;
        
        // Update text
        if (slideCurrentText) {
            slideCurrentText.textContent = String(currentSlide + 1).padStart(2, '0');
        }
        
        // Update indicators
        carouselIndicators.forEach((sq, i) => {
            sq.classList.toggle('active', i === currentSlide);
        });
    }

    function nextSlide() {
        goToSlide((currentSlide + 1) % 3);
    }

    function startCarousel() {
        if (carouselInterval) clearInterval(carouselInterval);
        carouselInterval = setInterval(nextSlide, 4000);
    }

    // Initialize carousel clicks
    carouselIndicators.forEach((sq, index) => {
        sq.addEventListener('click', () => {
            goToSlide(index);
            startCarousel(); // reset timer
        });
    });

    startCarousel();

    // ==========================================
    // Q&A Mock Logic
    // ==========================================
    const historyDeleteBtns = document.querySelectorAll('.history-delete-btn');
    historyDeleteBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // prevent activating the item
            const item = e.target.closest('.qa-history-item');
            if (item) item.remove();
        });
    });

    const historyItems = document.querySelectorAll('.qa-history-item');
    historyItems.forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.qa-history-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
        });
    });

    const qaTextarea = document.querySelector('.qa-textarea');
    const qaSendBtn = document.querySelector('.qa-send-btn');
    const qaChatArea = document.querySelector('.qa-chat-area');

    function sendQaMessage() {
        if (!qaTextarea || !qaChatArea) return;
        const text = qaTextarea.value.trim();
        if (!text) return;

        // 1. Add user message
        const userBubble = document.createElement('div');
        userBubble.className = 'chat-bubble user-bubble';
        userBubble.innerHTML = `
            <div class="bubble-header">USER // OP-77</div>
            <div class="bubble-content">${text.replace(/\n/g, '<br>')}</div>
        `;
        qaChatArea.appendChild(userBubble);
        qaTextarea.value = '';

        // scroll to bottom
        qaChatArea.scrollTop = qaChatArea.scrollHeight;

        // 2. Mock AI response after 1 second
        setTimeout(() => {
            const aiBubble = document.createElement('div');
            aiBubble.className = 'chat-bubble ai-bubble';
            aiBubble.innerHTML = `
                <div class="bubble-header">KMS-AI // ASSISTANT</div>
                <div class="bubble-content">收到您的消息：<br>"${text}"<br><br>这是一个模拟回复。由于当前没有连接后端大模型，我只能原样返回这段文本。</div>
            `;
            qaChatArea.appendChild(aiBubble);
            qaChatArea.scrollTop = qaChatArea.scrollHeight;
        }, 1000);
    }

    if (qaSendBtn) {
        qaSendBtn.addEventListener('click', sendQaMessage);
    }

    if (qaTextarea) {
        qaTextarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendQaMessage();
            }
        });
    }

    // ==========================================
    // Profile Edit & PWD Logic
    // ==========================================
    const profileEditBtn = document.querySelector('.edit-action-btn');
    const profilePwdBtn = document.querySelector('.pwd-action-btn');
    const profileViewport = document.querySelector('.profile-right-viewport');
    
    // Edit Elements
    const editCancelBtn = document.querySelector('.edit-cancel-btn');
    const editSaveBtn = document.querySelector('.edit-save-btn');
    
    // PWD Elements
    const pwdCancelBtn = document.querySelector('.pwd-cancel-btn');
    const pwdSaveBtn = document.querySelector('.pwd-save-btn');

    // Edit Toggle
    if (profileEditBtn && profileViewport) {
        profileEditBtn.addEventListener('click', () => {
            profileViewport.classList.remove('is-pwding');
            profileViewport.classList.add('is-editing');
        });
    }
    if (editCancelBtn && profileViewport) {
        editCancelBtn.addEventListener('click', () => {
            profileViewport.classList.remove('is-editing');
        });
    }
    if (editSaveBtn && profileViewport) {
        editSaveBtn.addEventListener('click', () => {
            profileViewport.classList.remove('is-editing');
        });
    }

    // PWD Toggle
    if (profilePwdBtn && profileViewport) {
        profilePwdBtn.addEventListener('click', () => {
            profileViewport.classList.remove('is-editing');
            profileViewport.classList.add('is-pwding');
        });
    }
    if (pwdCancelBtn && profileViewport) {
        pwdCancelBtn.addEventListener('click', () => {
            profileViewport.classList.remove('is-pwding');
        });
    }
    if (pwdSaveBtn && profileViewport) {
        pwdSaveBtn.addEventListener('click', () => {
            profileViewport.classList.remove('is-pwding');
        });
    }

    // ==========================================
    // Repo Detail Drill-down & Tree Logic
    // ==========================================
    const repoCards = document.querySelectorAll('.repo-card');
    const repoViewport = document.querySelector('.repo-viewport');
    const repoBackBtn = document.querySelector('.repo-back-btn');

    // Handle entering repo detail
    repoCards.forEach(card => {
        card.addEventListener('click', () => {
            // Only drill down if it's not an empty filler
            if(card.style.opacity !== '0.2' && repoViewport) {
                repoViewport.classList.add('is-drilling');
                // Could update title dynamically here based on card content
            }
        });
    });

    // Handle back button
    if (repoBackBtn && repoViewport) {
        repoBackBtn.addEventListener('click', () => {
            repoViewport.classList.remove('is-drilling');
        });
    }

    // Handle tree node expand/collapse & active state
    const nodeLabels = document.querySelectorAll('.node-label');
    nodeLabels.forEach(label => {
        label.addEventListener('click', (e) => {
            // 1. Set active state
            document.querySelectorAll('.node-label').forEach(l => l.classList.remove('active'));
            label.classList.add('active');

            // 2. Prevent actions button click from triggering fold (if clicked on child buttons)
            if (e.target.classList.contains('node-btn')) {
                return;
            }

            // 3. Expand/collapse logic
            const node = label.closest('.tree-node');
            const icon = label.querySelector('.node-icon');
            
            // If it's not a leaf node (has children or icon is +/-)
            if (icon && icon.textContent !== '■') {
                if (node.classList.contains('expanded')) {
                    node.classList.remove('expanded');
                    icon.textContent = '[+]';
                } else {
                    node.classList.add('expanded');
                    icon.textContent = '[-]';
                }
            }
        });
    });

    // ==========================================
    // Note Read View Logic
    // ==========================================
    const noteReadView = document.getElementById('view-note-read');
    const noteBackBtn = document.querySelector('.note-back-btn');
    let previousActiveView = null;

    // Find all 'READ' buttons and '查看' buttons (Favorites)
    const readBtns = document.querySelectorAll('.profile-action-btn, .fav-action-btn');
    readBtns.forEach(btn => {
        if (btn.innerText.includes('READ') || btn.innerText.includes('查看')) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Store the current active view
                const currentActive = document.querySelector('.page-view.active');
                if (currentActive && currentActive.id !== 'view-note-read') {
                    previousActiveView = currentActive;
                }
                
                // Hide all views and show note-read
                document.querySelectorAll('.page-view').forEach(view => view.classList.remove('active'));
                if (noteReadView) {
                    noteReadView.classList.add('active');
                }
            });
        }
    });

    // Handle Note Back
    if (noteBackBtn) {
        noteBackBtn.addEventListener('click', () => {
            if (noteReadView) noteReadView.classList.remove('active');
            if (previousActiveView) {
                previousActiveView.classList.add('active');
            } else {
                // Fallback to repository if history is lost
                const repoView = document.getElementById('view-repository');
                if(repoView) repoView.classList.add('active');
            }
        });
    }

    // Like and Star Toggles
    const likeBtn = document.querySelector('.like-btn');
    const starBtn = document.querySelector('.star-btn');
    
    if (likeBtn) {
        likeBtn.addEventListener('click', () => {
            likeBtn.classList.toggle('active');
            if (likeBtn.classList.contains('active')) {
                likeBtn.innerText = '♥ LIKED // 129';
            } else {
                likeBtn.innerText = '♡ LIKE // 128';
            }
        });
    }

    if (starBtn) {
        starBtn.addEventListener('click', () => {
            starBtn.classList.toggle('active');
            if (starBtn.classList.contains('active')) {
                starBtn.innerText = '★ STARRED // 已收藏';
            } else {
                starBtn.innerText = '☆ STAR // 收藏';
            }
        });
    }

    // ==========================================
    // Login Form Logic
    // ==========================================
    const loginForm = document.getElementById('loginForm');
    const loginStatusMsg = document.getElementById('loginStatus');
    const loginSubmitBtn = document.querySelector('.login-submit-btn .btn-text');
    const loginSubmitButton = document.getElementById('loginSubmitBtn');
    const loginInputs = loginForm ? Array.from(loginForm.querySelectorAll('.cyber-input')) : [];
    const contactAdminBtn = document.getElementById('contactAdminBtn');

    function setLoginStatus(state, code, text) {
        if (!loginStatusMsg) return;
        loginStatusMsg.dataset.state = state;
        const codeNode = loginStatusMsg.querySelector('.status-code');
        const textNode = loginStatusMsg.querySelector('.status-text');
        if (codeNode) codeNode.textContent = code;
        if (textNode) textNode.textContent = text;
    }

    function setLoginButton(state, text) {
        if (!loginSubmitButton) return;
        loginSubmitButton.classList.remove('is-loading', 'is-success', 'is-error', 'is-locked');
        if (state) loginSubmitButton.classList.add(state);
        loginSubmitButton.disabled = state === 'is-loading';
        if (loginSubmitBtn) loginSubmitBtn.innerText = text;
    }

    function setInputState(state) {
        loginInputs.forEach(input => {
            input.classList.remove('is-error', 'is-locked');
            if (state) input.classList.add(state);
            input.disabled = state === 'is-locked';
        });
    }

    function formatLockedUntil(value) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleString('zh-CN', { hour12: false });
    }

    function normalizeLoginFailure(status, detail) {
        const payload = detail && typeof detail === 'object' ? detail.detail : null;
        const code = payload?.code || (status === 423 ? 'locked' : 'invalid');
        const message = payload?.message || '账号或密码错误，请重试。';
        const remaining = typeof payload?.remaining_attempts === 'number' ? payload.remaining_attempts : null;
        const lockedUntil = payload?.locked_until || null;

        if (code === 'locked' || status === 423) {
            const suffix = lockedUntil ? ` 解锁时间：${formatLockedUntil(lockedUntil)}` : '';
            return {
                state: 'locked',
                buttonState: 'is-locked',
                inputState: 'is-locked',
                buttonText: 'LOCKED // 访问冻结',
                statusCode: 'SYS://ACCOUNT_LOCKED',
                statusText: `${message}${suffix}`
            };
        }

        const suffix = remaining !== null ? ` 剩余 ${remaining} 次。` : '';
        return {
            state: 'error',
            buttonState: 'is-error',
            inputState: 'is-error',
            buttonText: 'ACCESS DENIED // 拒绝访问',
            statusCode: 'SYS://ACCESS_DENIED',
            statusText: `${message}${suffix}`
        };
    }

    if (contactAdminBtn) {
        contactAdminBtn.addEventListener('click', () => {
            setLoginStatus('error', 'SYS://CONTACT_ADMIN', '请联系系统管理员重置密码或恢复账号。');
        });
    }
    
    if (loginForm) {
        fetch('/api/v1/auth/me', { cache: 'no-store' })
            .then(response => {
                if (!response.ok) return;
                setLoginButton('is-success', 'SESSION DETECTED // 会话有效');
                setLoginStatus('success', 'SYS://SESSION_DETECTED', '检测到有效会话，正在进入系统...');
                setTimeout(() => {
                    window.location.href = '/';
                }, 700);
            })
            .catch(() => {});

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault(); // Prevent standard form submission
            const username = document.getElementById('loginUsername')?.value.trim();
            const password = document.getElementById('loginPassword')?.value.trim();

            setInputState('');
            if (!username || !password) {
                setInputState('is-error');
                setLoginButton('is-error', 'ACCESS DENIED // 拒绝访问');
                setLoginStatus('error', 'SYS://MISSING_CREDENTIAL', '请输入识别码和密钥。');
                return;
            }
            
            // Visual feedback
            setLoginButton('is-loading', 'AUTHENTICATING... // 正在校验');
            setLoginStatus('loading', 'SYS://AUTHENTICATING', 'ESTABLISHING SECURE CONNECTION...');

            try {
                const response = await fetch('/api/v1/auth/session-login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username, password }),
                    cache: 'no-store'
                });

                if (!response.ok) {
                    const detail = await response.json().catch(() => ({}));
                    const failure = normalizeLoginFailure(response.status, detail);
                    setInputState(failure.inputState);
                    setLoginButton(failure.buttonState, failure.buttonText);
                    setLoginStatus(failure.state, failure.statusCode, failure.statusText);
                    return;
                }

                setLoginButton('is-success', 'ACCESS GRANTED // 允许访问');
                setLoginStatus('success', 'SYS://ACCESS_GRANTED', '身份校验通过，正在进入系统...');
                
                setTimeout(() => {
                    window.location.href = '/';
                }, 800);
            } catch (error) {
                setInputState('is-error');
                setLoginButton('is-error', 'NETWORK ERROR // 链接失败');
                setLoginStatus('error', 'SYS://NETWORK_ERROR', '认证服务不可达，请稍后重试。');
            }
        });
    }
});
