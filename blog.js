document.addEventListener('DOMContentLoaded', function() {
    // Setup blog entries and ratings
    setupBlogEntries();
    setupRatings();
    
    // Initialize search
    setupSearch();

    // Parse markdown-like syntax in blog content and add Wikipedia links
    function parseContent() {
        const contents = document.querySelectorAll('.blog-content');

        contents.forEach(content => {
            // Parse subheadings (###)
            let html = content.innerHTML;
            html = html.replace(/###\s+([^\n]+)/g, '<h3>$1</h3>');

            // Parse paragraphs (double newlines)
            html = html.replace(/\n\n/g, '</p><p>');
            html = '<p>' + html + '</p>';

            // Parse bold text (**) and convert relevant terms to Wikipedia links
            html = html.replace(/\*\*([^*]+)\*\*/g, (match, term) => {
                const scientificTerms = [
                    'Kardashev Scale', 'Big Bang', 'supernova', 'lubang hitam',
                    'time dilation', 'dark matter', 'dark energy', 'radiasi',
                    'Hawking radiation', 'multiverse', 'pulsar', 'CMB',
                    'neutrino', 'bintang', 'galaksi', 'holographic principle', 'entropi', 'planet'
                ];

                const searchTerm = term.toLowerCase();
                const matchedTerm = scientificTerms.find(sciTerm =>
                    searchTerm.includes(sciTerm.toLowerCase())
                );

                if (matchedTerm) {
                    const wikiLink = `https://id.wikipedia.org/wiki/${encodeURIComponent(matchedTerm)}`;
                    return `<strong class="wiki-link" onclick="window.open('${wikiLink}', '_blank')">${term}</strong>`;
                }
                return `<strong>${term}</strong>`;
            });

            content.innerHTML = html;
        });
    }

    // Rating system
    function setupRating() {
        const ratings = document.querySelectorAll('.rating');

        ratings.forEach(rating => {
            const stars = rating.querySelectorAll('.fa-star');
            const articleId = rating.closest('.rating-container').dataset.articleId;
            const countSpan = rating.querySelector('.rating-count');

            // Load saved ratings
            const savedRatings = JSON.parse(localStorage.getItem(`ratings_${articleId}`) || '{"count": 0, "total": 0}');
            updateRatingDisplay(rating, savedRatings.total / savedRatings.count || 0);
            countSpan.textContent = `(${savedRatings.count} votes)`;

            stars.forEach(star => {
                star.addEventListener('mouseover', function() {
                    const rating = this.dataset.rating;
                    highlightStars(stars, rating);
                });

                star.addEventListener('mouseout', function() {
                    const currentRating = savedRatings.total / savedRatings.count || 0;
                    highlightStars(stars, currentRating);
                });

                star.addEventListener('click', function() {
                    const rating = parseInt(this.dataset.rating);
                    savedRatings.count++;
                    savedRatings.total += rating;
                    localStorage.setItem(`ratings_${articleId}`, JSON.stringify(savedRatings));

                    const averageRating = savedRatings.total / savedRatings.count;
                    updateRatingDisplay(rating, averageRating);
                    countSpan.textContent = `(${savedRatings.count} votes)`;

                    // Add sparkle animation for 5-star rating
                    if (rating === 5) {
                        stars.forEach(s => {
                            s.classList.add('sparkle');
                            setTimeout(() => s.classList.remove('sparkle'), 500);
                        });
                    }
                });
            });
        });
    }

    function highlightStars(stars, rating) {
        stars.forEach((star, index) => {
            star.classList.toggle('active', index < rating);
        });
    }

    function updateRatingDisplay(ratingElement, score) {
        let stars;
        
        if (typeof ratingElement === 'string') {
            // If ratingElement is an article ID
            const ratingContainer = document.querySelector(`.rating-container[data-article-id="${ratingElement}"]`);
            if (ratingContainer) {
                stars = ratingContainer.querySelectorAll('.fa-star');
            }
        } else if (ratingElement.querySelectorAll) {
            // If ratingElement is a DOM element
            stars = ratingElement.querySelectorAll('.fa-star');
        } else {
            // If ratingElement is the rating container itself
            const ratingContainer = ratingElement.closest('.rating-container');
            if (ratingContainer) {
                stars = ratingContainer.querySelectorAll('.fa-star');
            }
        }
        
        if (stars) {
            highlightStars(stars, score);
        }
    }

    // Handle blog entry expansion and close
    function setupBlogEntries() {
        const entries = document.querySelectorAll('.blog-entry');
        const overlay = document.querySelector('.overlay');
        let currentEntry = null;

        entries.forEach(entry => {
            const title = entry.querySelector('.blog-title');
            const closeBtn = entry.querySelector('.btn-close');

            function closeEntry() {
                if (currentEntry) {
                    currentEntry.classList.remove('expanded');
                    overlay.classList.remove('active');
                    document.body.style.overflow = '';
                    currentEntry = null;
                }
            }

            title.addEventListener('click', () => {
                if (currentEntry === entry) {
                    closeEntry();
                    return;
                }

                if (currentEntry) {
                    currentEntry.classList.remove('expanded');
                }

                entry.classList.add('expanded');
                overlay.classList.add('active');
                document.body.style.overflow = 'hidden';
                currentEntry = entry;
            });

            if (closeBtn) {
                closeBtn.addEventListener('click', closeEntry);
            }
            overlay.addEventListener('click', closeEntry);
        });
    }

    // Setup star rating system
    function setupRatings() {
        const ratingContainers = document.querySelectorAll('.rating-container');

        ratingContainers.forEach(container => {
            const stars = container.querySelectorAll('.fa-star');
            const ratingCount = container.querySelector('.rating-count');
            const articleId = container.dataset.articleId;

            stars.forEach(star => {
                star.addEventListener('click', function() {
                    const rating = parseInt(this.dataset.rating);
                    // Here you would normally send this rating to a server
                    console.log(`Article ${articleId} rated ${rating} stars`);

                    // Visual feedback (highlight stars)
                    stars.forEach(s => {
                        const starRating = parseInt(s.dataset.rating);
                        if (starRating <= rating) {
                            s.classList.add('text-warning');
                        } else {
                            s.classList.remove('text-warning');
                        }
                    });

                    // Update count display (fake update for demo)
                    const currentCount = parseInt(ratingCount.textContent.match(/\d+/)[0] || '0');
                    ratingCount.textContent = `(${currentCount + 1} votes)`;
                });
            });
        });
    }

    // Search functionality
    function setupSearch() {
        const searchInput = document.getElementById('searchInput');
        const entries = document.querySelectorAll('.blog-entry');

        // Clear search input on page load
        searchInput.value = '';

        searchInput.addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase().trim();
            
            // If search term is empty, show all entries
            if (!searchTerm) {
                entries.forEach(entry => {
                    entry.style.display = 'block';
                });
                return;
            }

            // Count visible entries
            let visibleCount = 0;
            
            entries.forEach(entry => {
                const title = entry.querySelector('.blog-title').textContent.toLowerCase();
                const content = entry.querySelector('.blog-content').textContent.toLowerCase();
                const isMatch = title.includes(searchTerm) || content.includes(searchTerm);

                entry.style.display = isMatch ? 'block' : 'none';
                
                if (isMatch) {
                    visibleCount++;
                }
            });
            
            console.log(`Search for "${searchTerm}" found ${visibleCount} matches`);
        });
    }

    // Initialize
    parseContent();
    setupBlogEntries();
    setupSearch();
    setupRating();
});