import { openUrlViaIntent } from './intent-handler.js';
import { Console } from './core-telemetry.js';

function createCard(data, type) {
  const card = document.createElement('button');
  card.className = 'contrib-card';
  card.setAttribute('type', 'button');

  const img = document.createElement('img');
  img.setAttribute('loading', 'lazy');
  img.style.cssText =
    'width: 40px; height: 40px; border-radius: 50%; object-fit: cover;';

  const contentDiv = document.createElement('div');
  contentDiv.style.cssText =
    'display: flex; flex-direction: column; align-items: flex-start; gap: 2px;';

  if (type === 'contributor') {
    const username = data.username || data.name || 'unknown';
    img.src = `https://github.com/${encodeURIComponent(username)}.png`;
    img.alt = `${data.name} avatar`;
    img.onerror = function () {
      this.src = '/assets/user-v3.svg';
    };

    const nameRow = document.createElement('div');
    nameRow.style.cssText = 'display: flex; align-items: center; gap: 6px;';

    const nameEl = document.createElement('div');
    nameEl.className = 'contrib-name';
    nameEl.textContent = data.name || 'Unknown';

    const usernameEl = document.createElement('div');
    usernameEl.className = 'contrib-role';
    usernameEl.textContent = `(@${username})`;

    nameRow.appendChild(nameEl);
    nameRow.appendChild(usernameEl);

    const roleEl = document.createElement('div');
    roleEl.className = 'contrib-role';
    roleEl.textContent = data.role || 'Unknown Role';

    contentDiv.appendChild(nameRow);
    contentDiv.appendChild(roleEl);

    const profileURL = data.url || '#';
    card.addEventListener('click', () => openUrlViaIntent(profileURL));
  } else if (type === 'repository') {
    img.src = `https://github.com/${encodeURIComponent(data.owner)}.png`;
    img.alt = `${data.name} repository`;
    img.onerror = function () {
      this.src = '/assets/github-v3.svg';
    };

    const nameEl = document.createElement('div');
    nameEl.className = 'contrib-name';
    nameEl.textContent = data.name || 'Unknown';

    const descEl = document.createElement('div');
    descEl.className = 'contrib-role';
    descEl.textContent = data.description || 'Repository';

    contentDiv.appendChild(nameEl);
    contentDiv.appendChild(descEl);

    const repoURL = data.url || '#';
    card.addEventListener('click', () => openUrlViaIntent(repoURL));
  } else if (type === 'special-thanks') {
    const username = data.username || 'unknown';
    img.src = `https://github.com/${encodeURIComponent(username)}.png`;
    img.alt = `${data.name} avatar`;
    img.onerror = function () {
      this.src = '/assets/user-v3.svg';
    };

    const nameRow = document.createElement('div');
    nameRow.style.cssText = 'display: flex; align-items: center; gap: 6px;';

    const nameEl = document.createElement('div');
    nameEl.className = 'st-name';
    nameEl.textContent = data.name || 'Unknown';

    const usernameEl = document.createElement('div');
    usernameEl.className = 'st-role';
    usernameEl.textContent = `(@${username})`;

    nameRow.appendChild(nameEl);
    nameRow.appendChild(usernameEl);

    const roleEl = document.createElement('div');
    roleEl.className = 'st-role';
    roleEl.textContent = data.role || 'Developer';

    const repoEl = document.createElement('div');
    repoEl.className = 'st-role';
    repoEl.textContent = data.repo || '';

    contentDiv.appendChild(nameRow);
    contentDiv.appendChild(roleEl);
    if (data.repo) contentDiv.appendChild(repoEl);

    const profileURL = data.profile || '#';
    card.addEventListener('click', () => openUrlViaIntent(profileURL));
  }

  card.appendChild(img);
  card.appendChild(contentDiv);
  return card;
}

export async function renderAboutSections() {
  const sections = [
    {
      url: 'json/dev.json',
      containerId: 'contrib-list',
      dataKey: 'contributors',
      type: 'contributor',
      name: 'contributors',
    },
    {
      url: 'json/repo.json',
      containerId: 'repo-list',
      dataKey: 'repositories',
      type: 'repository',
      name: 'repositories',
    },
    {
      url: 'json/st.json',
      containerId: 'st',
      dataKey: 'st',
      type: 'special-thanks',
      name: 'special thanks',
    },
  ];

  const fetchPromises = sections.map((section) =>
    fetch(section.url)
      .then((res) => (res.ok ? res.json() : null))
      .catch((err) => {
        Console.error(`Failed to load ${section.name}: ${err.message}`);
        return null;
      })
  );

  const results = await Promise.all(fetchPromises);

  results.forEach((data, index) => {
    if (!data) return;

    const section = sections[index];
    const container = document.getElementById(section.containerId);

    if (container && Array.isArray(data[section.dataKey])) {
      container.innerHTML = '';

      data[section.dataKey].forEach((item) => {
        if (!item || typeof item !== 'object') {
          Console.error(
            `Invalid ${section.name} data: expected object, got ${typeof item}`
          );
          return;
        }

        try {
          const card = createCard(item, section.type);
          container.appendChild(card);
        } catch (err) {
          Console.error(
            `Failed to render ${section.name} card: ${err.message}`
          );
        }
      });

      Console.success(`Loaded ${data[section.dataKey].length} ${section.name}`);
    }
  });
}