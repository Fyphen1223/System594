document.addEventListener('DOMContentLoaded', () => {
	// Handle document form submission
	const documentForm = document.getElementById('document-form');
	const documentResponse = document.getElementById('response');

	if (documentForm) {
		documentForm.addEventListener('submit', async (e) => {
			e.preventDefault();

			// Disable submit button and show loading state
			const submitButton = documentForm.querySelector('.submit-btn');
			const originalButtonText = submitButton.textContent;
			submitButton.disabled = true;
			submitButton.textContent = 'Creating...';

			try {
				// Get form data
				const formData = new FormData(documentForm);
				const data = {
					title: formData.get('title'),
					author: formData.get('author'),
					year: formData.get('year'),
					body: formData.get('body'),
					link: formData.get('link'),
					tags: formData
						.get('tags')
						.split(',')
						.map((tag) => tag.trim())
						.filter((tag) => tag),
				};

				// Send POST request
				const response = await fetch('/api/create', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify(data),
				});

				const result = await response.json();

				if (!response.ok) {
					throw new Error(result.message || 'Failed to create document');
				}

				// Show success message
				documentResponse.textContent = 'Document created successfully!';
				documentResponse.className = 'response-message success';

				// Reset form
				documentForm.reset();
			} catch (error) {
				// Show error message
				documentResponse.textContent =
					error.message || 'Failed to create document';
				documentResponse.className = 'response-message error';
			} finally {
				// Restore submit button
				submitButton.disabled = false;
				submitButton.textContent = originalButtonText;

				// Auto-hide message after 5 seconds
				setTimeout(() => {
					documentResponse.style.display = 'none';
				}, 5000);
			}
		});
	}

	// Handle search form submission
	const searchForm = document.getElementById('search-form');
	const searchResults = document.getElementById('search-results');

	// Show success message if returning from delete operation
	const urlParams = new URLSearchParams(window.location.search);
	if (urlParams.get('deleted') === 'true') {
		const tempMessage = document.createElement('div');
		tempMessage.className = 'response-message success';
		tempMessage.textContent = 'Document deleted successfully';
		document
			.querySelector('.container')
			.insertBefore(tempMessage, document.querySelector('section'));
		setTimeout(() => tempMessage.remove(), 5000);
		// Clean up URL
		window.history.replaceState({}, document.title, '/');
	}

	if (searchForm) {
		searchForm.addEventListener('submit', async (e) => {
			e.preventDefault();

			// Get search parameters
			const searchType = searchForm.querySelector('#search-type').value;
			const searchQuery = searchForm.querySelector('#search-query').value;

			// Clear previous results
			searchResults.innerHTML = '';

			try {
				// Send search request
				const response = await fetch(`/api/search/${searchType}`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ [searchType]: searchQuery }),
				});

				const result = await response.json();

				if (!response.ok) {
					throw new Error(result.message || 'Search failed');
				}

				// Display results
				if (result.hits.hits.length === 0) {
					searchResults.innerHTML =
						'<div class="response-message">No documents found.</div>';
					return;
				}

				result.hits.hits.forEach((hit) => {
					const doc = hit._source;
					const highlight = hit.highlight || {};

					// Get highlighted text or fallback to original
					const titleDisplay = highlight.title ? highlight.title[0] : doc.title;
					const bodyDisplay = highlight.body
						? highlight.body[0]
						: doc.body.substring(0, 200) +
						  (doc.body.length > 200 ? '...' : '');
					const authorDisplay = highlight.author
						? highlight.author[0]
						: doc.author;
					const tagsDisplay = doc.tags.map((tag) => {
						const highlightedTag =
							highlight.tags &&
							highlight.tags.find(
								(t) =>
									t.toLowerCase().includes(tag.toLowerCase()) ||
									tag.toLowerCase().includes(t.toLowerCase())
							);
						return highlightedTag || tag;
					});

					const resultItem = document.createElement('div');
					resultItem.className = 'result-item';
					resultItem.innerHTML = `
                        <div class="result-id">ID: ${doc.id}</div>
                        <h3>
                            <a href="edit?id=${doc.id}" class="result-title">
                                ${titleDisplay}
                            </a>
                        </h3>
                        <div class="result-meta">
                            <span>${authorDisplay} • ${doc.year}</span>
                        </div>
                        <p>${bodyDisplay}</p>
                        <div class="result-tags">
                            ${tagsDisplay
								.map((tag) => `<span class="result-tag">${tag}</span>`)
								.join('')}
                        </div>
                        <a href="${
							doc.link
						}" target="_blank" rel="noopener noreferrer">View Reference</a>
                    `;
					searchResults.appendChild(resultItem);
				});
			} catch (error) {
				searchResults.innerHTML = `
                    <div class="response-message error">
                        ${error.message || 'An error occurred while searching.'}
                    </div>
                `;
			}
		});
	}
});

// Function to load and display all documents
function loadDocuments(containerId = 'documents-list', limit = 10) {
	const container = document.getElementById(containerId);

	if (!container) return;

	// Show loading indicator
	container.innerHTML = '<div class="loading">Loading documents...</div>';

	fetch(`/api/documents?limit=${limit}`)
		.then((response) => {
			if (!response.ok) {
				throw new Error('Failed to fetch documents');
			}
			return response.json();
		})
		.then((data) => {
			if (!data.hits.hits || data.hits.hits.length === 0) {
				container.innerHTML =
					'<div class="response-message">No documents available.</div>';
				return;
			}

			// Clear container
			container.innerHTML = '';

			// Display each document
			data.hits.hits.forEach((doc) => {
				const docElement = document.createElement('div');
				docElement.className = 'result-item';
				docElement.innerHTML = `
					<div class="result-id">ID: ${doc._source.id}</div>
					<h3>
						<a href="edit?id=${doc._source.id}" class="result-title">
							${doc._source.title}
						</a>
					</h3>
					<div class="result-meta">
						<span>${doc._source.author} • ${doc._source.year}</span>
					</div>
					<p>${
						doc._source.body.substring(0, 200) +
						(doc._source.body.length > 200 ? '...' : '')
					}</p>
					<div class="result-tags">
						${doc._source.tags.map((tag) => `<span class="result-tag">${tag}</span>`).join('')}
					</div>
					<a href="${doc._source.link}" target="_blank" rel="noopener noreferrer">View Reference</a>
				`;
				container.appendChild(docElement);
			});
		})
		.catch((error) => {
			container.innerHTML = `
				<div class="response-message error">
					${error.message || 'An error occurred while loading documents.'}
				</div>
			`;
		});
}

// Call function when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
	loadDocuments();
});
