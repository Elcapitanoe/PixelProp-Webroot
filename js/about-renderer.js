import { openUrlViaIntent } from './intent-handler.js';

export async function renderAboutSections() {
  try {
    const devRes = await fetch('json/dev.json');
    if (devRes.ok) {
      const data = await devRes.json();
      const container = document.getElementById('contrib-list');
      if (container && Array.isArray(data.contributors)) {
        container.innerHTML = '';
        data.contributors.forEach((user) => {
          const username = user.username || user.name || 'unknown';
          const avatar = `https://github.com/${encodeURIComponent(
            username
          )}.png`;
          const profileURL = user.url || '#';
          const rawRole = user.role || 'Unknown Role';

          const card = document.createElement('button');
          card.className = 'contrib-card';
          card.setAttribute('type', 'button');
          card.addEventListener('click', () => openUrlViaIntent(profileURL));

          card.innerHTML = `
                    <img src="${avatar}" alt="${user.name}" onerror="this.src='/assets/user-v3.svg'" />
                    <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 2px;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <div class="contrib-name">${user.name}</div>
                            <div class="contrib-role">(@${username})</div>
                        </div>
                        <div class="contrib-role">${rawRole}</div>
                    </div>
                    `;
          container.appendChild(card);
        });
      }
    }
  } catch (err) {
    console.error('Failed to load contributors:', err);
  }

  try {
    const repoRes = await fetch('json/repo.json');
    if (repoRes.ok) {
      const data = await repoRes.json();
      const repoContainer = document.getElementById('repo-list');
      if (repoContainer && Array.isArray(data.repositories)) {
        repoContainer.innerHTML = '';
        data.repositories.forEach((repo) => {
          const avatar = `https://github.com/${repo.owner}.png`;
          const repoURL = repo.url || '#';
          const desc = repo.description || 'Repository';

          const card = document.createElement('button');
          card.className = 'contrib-card';
          card.setAttribute('type', 'button');
          card.addEventListener('click', () => openUrlViaIntent(repoURL));

          card.innerHTML = `
                        <img src="${avatar}" alt="GitHub Logo" onerror="this.src='/assets/github-v3.svg'" />
                        <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 2px;">
                            <div class="contrib-name">${repo.name}</div>
                            <div class="contrib-role">${desc}</div>
                        </div>
                    `;
          repoContainer.appendChild(card);
        });
      }
    }
  } catch (err) {
    console.error('Failed to load repo.json:', err);
  }

  try {
    const stRes = await fetch('json/st.json');
    if (stRes.ok) {
      const data = await stRes.json();
      const repoContainer = document.getElementById('st');
      if (repoContainer && Array.isArray(data.st)) {
        repoContainer.innerHTML = '';
        data.st.forEach((st) => {
          const avatar = `https://github.com/${encodeURIComponent(
            st.username
          )}.png`;
          const stURL = st.repo || '#';
          const stROLE = st.role || 'Developer';
          const stPROFILE = st.profile || '#';

          const card = document.createElement('button');
          card.className = 'contrib-card';
          card.setAttribute('type', 'button');
          card.addEventListener('click', () => openUrlViaIntent(stPROFILE));

          card.innerHTML = `
                        <img src="${avatar}" alt="GitHub Logo" onerror="this.src='/assets/user-v3.svg'" />
                        <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 2px;">
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <div class="st-name">${st.name}</div>
                                <div class="st-role">(@${st.username})</div>
                            </div>
                            <div class="st-role">${stROLE}</div>
                            <div class="st-role">${stURL}</div>
                        </div>
                    `;
          repoContainer.appendChild(card);
        });
      }
    }
  } catch (err) {
    console.error('Failed to load st.json:', err);
  }
}
