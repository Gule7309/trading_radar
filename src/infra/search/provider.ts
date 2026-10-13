export interface SearchQuery {
  query: string;
  from?: string;
  to?: string;
  maxResults?: number;
}

export interface SearchResult {
  title: string;
  url: string;
  publisher?: string;
  publishedAt?: string;
  snippet: string;
}

export interface SearchProvider {
  readonly name: string;
  search(input: SearchQuery): Promise<SearchResult[]>;
}

export class UnconfiguredSearchProvider implements SearchProvider {
  readonly name = "unconfigured";

  async search(): Promise<SearchResult[]> {
    throw new Error(
      "No dynamic news search provider is configured. " +
        "Choose a provider and supply its credentials before enabling SEARCH_NEWS.",
    );
  }
}
