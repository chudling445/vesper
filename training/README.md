# Vesper Scholar-Linux training plan

Vesper now has a richer persona prompt for philosophy, history, and Linux, plus an original seed set for behavior tests. This folder is intentionally not a claim that a new foundation model has already been trained.

## Safe source policy

Do not scrape the entire internet or copy arbitrary books and websites into a training corpus. For every downloaded item, record the source URL, title, access date, page-level license or permission, SPDX identifier when applicable, and a SHA-256 hash. Reject content when the license is unclear. Fordham's Internet History Sourcebooks Project describes a mixture of public-domain and copy-permitted historical texts, so each linked document still needs a page-level check. Project Gutenberg similarly requires checking the individual ebook header and terms. GNU and Linux kernel documentation are useful technical sources, but their pages and files can have different license requirements.

## Recommended pipeline

1. Start with `vesper-seed.jsonl` as a behavior regression set, not as a knowledge corpus.
2. Download only approved public-domain or compatible-license texts into a separate, ignored `raw/` directory.
3. Normalize text without removing citations or provenance.
4. Chunk by document section and keep metadata beside every chunk.
5. Prefer retrieval-augmented generation for current Linux commands and historical references.
6. Fine-tune a small instruction model only after license review, deduplication, evaluation, and a clear compute budget.
7. Evaluate for hallucinated dates, invented citations, unsafe shell commands, overconfident historical claims, and failure to state that Vesper is an AI.

The current Vesper application uses the configured provider/model and this persona layer. A genuine separately trained model requires a base model, licensed corpus, GPU/CPU budget, tokenizer compatibility, training code, checkpoints, and evaluation; it should not be represented as complete until those artifacts exist.

## Initial source registry

See [`sources.json`](./sources.json). The registry includes Project Gutenberg, Fordham IHSP, GNU, Linux kernel documentation, and SPDX. These are starting points for a provenance-aware corpus, not permission to copy every page automatically.
