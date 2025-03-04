document.addEventListener('DOMContentLoaded', () => {
	const editForm = document.getElementById('edit-form');
	const deleteBtn = document.getElementById('delete-btn');
	const responseMessage = document.getElementById('response');
	const documentId = new URLSearchParams(window.location.search).get('id');

	if (!documentId) {
		window.location.href = '/';
		return;
	}

	// Load document data
	async function loadDocument() {
		try {
			const response = await fetch(`/api/document/${documentId}`);
			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || 'Failed to load document');
			}

			const doc = result._source;

			// Add document ID display
			const idDisplay = document.createElement('div');
			idDisplay.className = 'document-id';
			idDisplay.textContent = `Document ID: ${doc.id}`;
			editForm.insertBefore(idDisplay, editForm.firstChild);

			// Set form values
			document.getElementById('document-id').value = documentId;
			document.getElementById('title').value = doc.title;
			document.getElementById('author').value = doc.author;
			document.getElementById('year').value = doc.year;
			document.getElementById('body').value = doc.body;
			document.getElementById('link').value = doc.link;
			document.getElementById('tags').value = doc.tags.join(', ');

			document.title = `Edit - ${doc.title}`;
		} catch (error) {
			showError(error.message || 'Error loading document');
			console.error('Error:', error);
		}
	}

	// Handle form submission for updating
	if (editForm) {
		editForm.addEventListener('submit', async (e) => {
			e.preventDefault();

			// Disable submit button and show loading state
			const submitBtn = editForm.querySelector('.submit-btn');
			const originalBtnText = submitBtn.textContent;
			submitBtn.disabled = true;
			submitBtn.textContent = 'Updating...';

			try {
				const formData = new FormData(editForm);
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
					id: documentId,
				};

				const response = await fetch(`/api/document/${documentId}`, {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify(data),
				});

				const result = await response.json();

				if (!response.ok) {
					throw new Error(result.message || 'Failed to update document');
				}

				showSuccess('Document updated successfully!');
			} catch (error) {
				showError(error.message || 'Error updating document');
				console.error('Error:', error);
			} finally {
				submitBtn.disabled = false;
				submitBtn.textContent = originalBtnText;
			}
		});
	}

	// Handle document deletion
	if (deleteBtn) {
		deleteBtn.addEventListener('click', async () => {
			if (
				!confirm(
					'Are you sure you want to delete this document? This action cannot be undone.'
				)
			) {
				return;
			}

			deleteBtn.disabled = true;
			const originalBtnText = deleteBtn.textContent;
			deleteBtn.textContent = 'Deleting...';

			try {
				const response = await fetch(`/api/document/${documentId}`, {
					method: 'DELETE',
				});

				const result = await response.json();

				if (!response.ok) {
					throw new Error(result.message || 'Failed to delete document');
				}

				// Redirect to home page with success message
				window.location.href = '/?deleted=true';
			} catch (error) {
				showError(error.message || 'Error deleting document');
				console.error('Error:', error);
				deleteBtn.disabled = false;
				deleteBtn.textContent = originalBtnText;
			}
		});
	}

	function showSuccess(message) {
		responseMessage.textContent = message;
		responseMessage.className = 'response-message success';
		responseMessage.style.display = 'block';
		setTimeout(() => {
			responseMessage.style.display = 'none';
		}, 5000);
	}

	function showError(message) {
		responseMessage.textContent = message;
		responseMessage.className = 'response-message error';
		responseMessage.style.display = 'block';
		setTimeout(() => {
			responseMessage.style.display = 'none';
		}, 5000);
	}

	// Load document data when page loads
	loadDocument();
});
