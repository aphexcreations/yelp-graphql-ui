
// @flow

/**
 * Yelp Business Search Component
 *
 * This acts as a basic Yelp Business Search client,
 * making use of the Yelp GraphQL API.
 *
 * There are two Yelp bugs to be mindful of.  Please see the README.md
 * file for more information on those.
 *
 */

import React from "react";

// eslint-disable-next-line no-unused-vars
import Fontawesome from "font-awesome/scss/font-awesome.scss";
import Autosuggest from "react-autosuggest";
import TrieSearch from "trie-search";

// eslint-disable-next-line no-unused-vars
import AppStyle from "./app.scss";

import type {
  ReactNode,
  ReactEvent,
  AppQueryObj,
  AppCatOrig,
  AppCatsOrig,
  AppCat,
  AppCats,
  AppFav,
  AppBizRec,
  AppBizRecs,
  AppProps,
  AppState
} from "./types";

import {
  BIZ_SEARCH_LIMIT,
  BIZ_DISPLAY_LIMIT,
  CAT_SEARCH_LIMIT,
  CAT_CLEAN_RE,
  DISTANCE_MILES_MAX,
  DISTANCE_METERS_MAX,
  DISTANCE_METERS_PER_MILE,
  DISTANCE_DEFAULT,
  ZIP_DEFAULT
} from "./constants.js";

import {
  GQL_CLIENT,
  DB
} from "./services";


class App extends React.Component<AppProps, AppState> {

  /**
   * Constructor
   *
   * @param {AppProps} props - Props
   * @param {Object} context - Context
   * @return {void}
   */
  constructor(props: AppProps, context: Object): void {
    super(props, context);
    this.state = this.buildDefaultState();
    return;
  }

  /**
   * Returns a default state
   *
   * For more information on possible values and types
   * for each state property, see `types.AppState`.
   *
   * @retun {AppState}
   */
  buildDefaultState (): AppState {
    return {
      resultsStatus: "ready",
      fetchMode: null,
      sortField: "distance",
      sortDir: "asc",
      offset: 0,
      favorites: null,
      catTrie: null,
      suggestedCats: [],
      selectedCat: {
        alias: "restaurants",
        title: "Restaurants",
        clean: "restaurants"
      },
      typedCatVal: "Restaurants",
      zip: ZIP_DEFAULT,
      zipFinal: ZIP_DEFAULT,
      distanceMiles: DISTANCE_DEFAULT,
      distanceMeters: this.convertMilesToMeters(DISTANCE_DEFAULT),
      businessRecs: null,
      businessCountTotal: null
    };
  }

  /**
   * Performs a category search
   *
   * @param {string} value - Category string to search for
   * @return {AppCats} - Found categories
   */
  searchCategories (value: string): AppCats {
    const cleanVal: string = this.cleanCatTitle(value);
    if (this.state.catTrie == null) {
      this.setAppFatal("catTrie must be set");
      return [];
    }
    const res = this.state.catTrie.get(cleanVal).slice(0, CAT_SEARCH_LIMIT);
    return res;
  }

  /**
   * Event handler for setting suggested categories
   *
   * @param {{value: string}} - Category string to search for
   * @return {boolean}
   */
  handleSuggCatsFetchRequested ({value}: {value: string}): boolean {
    this.setState({
      suggestedCats: this.searchCategories(value)
    });
    return true;
  }

  /**
   * Event handler for when Autosuggest category search
   * is cleared.
   *
   * @return {boolean}
   */
  handleSuggCatsClearRequested (): boolean {
    this.setState({
      suggestedCats: []
    });
    return true;
  }

  /**
   * Autosuggest callback to get the internal value
   * of a category object
   *
   * @param {AppCat} cat - Category object
   * @return {string} - Category value
   */
  getSuggestionValue (cat: AppCat): string {
    return cat.alias;
  }

  /**
   * Autosuggest callback to get the display element
   * of a category object
   *
   * @param {AppCat} cat - Category object
   * @return {ReactNode} - Element to render
   */
  renderSuggCat (cat: AppCat): ReactNode {
    return (
      <div>
        {cat.title}
      </div>
    );
  }

  /**
   * Wrapper to clean and retrieve a single category
   * value if it exists
   *
   * @param {string} value - Category value to search for
   * @return {?AppCat} - Found catetgory, if any
   */
  findSingleCat (value: string): ?AppCat {
    const cleanVal: string = this.cleanCatTitle(value);
    if (this.state.catTrie == null) {
      this.setAppFatal("catTrie must be set");
      return null;
    }
    const res: AppCats = this.state.catTrie.get(cleanVal);
    if (res.length !== 1) {
      return null;
    }
    if (res[0].clean !== cleanVal) {
      return null;
    }
    return res[0];
  }

  /**
   * Event handler for suggested category change
   *
   * @param {ReactEvent} event - Event from Autosuggest
   * @param {{newValue: string}} - New category value
   * @return {boolean}
   */
  handleSuggCatChange (
    event: ReactEvent,
    {newValue}: {newValue: string}
  ): boolean {
    const selectedCat: ?AppCat = this.findSingleCat(newValue);
    const catVal: ?string = (
      (newValue === "") ?
        null :
        newValue
    );
    this.setState({
      typedCatVal: catVal,
      selectedCat: selectedCat
    });
    return true;
  }

  /**
   * Autosuggest event handler for selecting a
   * suggested category
   *
   * @param {ReactEvent} event - Event from Autosuggest
   * @param {
   *   suggestion: AppCat
   * } - Suggestion information from Autosuggest
   * @return {boolean}
   */
  handleSuggCatSelected (
    event: ReactEvent,
    {
      suggestion
    }: {
      suggestion: AppCat
    }
  ): boolean {
    this.setState({
      typedCatVal: suggestion.title,
      selectedCat: suggestion
    });
    return true;
  }

  /**
   * Get a suggested category display value
   *
   * @return {string}
   */
  getSuggCatValue (): string {
    if (this.state.typedCatVal == null) {
      return "";
    }
    return this.state.typedCatVal;
  }

  /**
   * Returns the Autosuggest element
   *
   * @return {ReactNode} -
   *   An element containing the Autosuggest element
   */
  renderInputCategories (): ReactNode {
    return (
      <div className="form-group mr-2">
        <Autosuggest
            suggestions={this.state.suggestedCats}
            onSuggestionsFetchRequested={
              this.handleSuggCatsFetchRequested.bind(this)
            }
            onSuggestionsClearRequested={
              this.handleSuggCatsClearRequested.bind(this)
            }
            onSuggestionSelected={this.handleSuggCatSelected.bind(this)}
            getSuggestionValue={this.getSuggestionValue.bind(this)}
            renderSuggestion={this.renderSuggCat.bind(this)}
            inputProps={{
              className: "form-control",
              placeholder: "Optional Category",
              value: this.getSuggCatValue(),
              onChange: this.handleSuggCatChange.bind(this)
            }}
        />
      </div>
    );
  }

  /**
   * React hook.
   * Calls initial data loader.
   *
   * @return {boolean}
   */
  componentWillMount (): boolean {
    this.loadInitData();
    return true;
  }

  /**
   * Loads initial data such as categories from the
   * Yelp REST api, and the favorites from IndexedDB
   *
   * @return {boolean}
   */
  loadInitData (): boolean {
    const loaders: Array<Promise<any>> = [
      this.loadCategories(),
      this.loadFavorites()
    ];
    Promise
      .all(loaders)
      .then(resGroups => {
        return {
          categories: resGroups[0],
          favorites: resGroups[1]
        };
      })
      .then(obj => {
        this.setState(
          {
            favorites: this.preProcessFavorites(obj.favorites),
            catTrie: this.preProcessCategories(obj.categories)
          },
          () => {
            this.fetchResults("search", 0);
            return true;
          }
        );
      });
    return true;
  }

  /**
   * Pre process favorites
   *
   * @param {Array<AppFav>} - Favorites records
   * @return {Set<string>} - Set of business ids
   */
  preProcessFavorites (favorites: Array<AppFav>): Set<string> {
    const results: Set<string> = new Set(favorites.map(fav => fav.business_id));
    return results;
  }

  /**
   * Load favorites from indexeddb
   *
   * @return {Array<AppFav>} - Favorites records
   */
  loadFavorites (): Promise<Array<AppFav>> {
    return (
      DB
        .favorites
        .toArray(favorites => favorites)
    );
  }

  /**
   * Load categories from Yelp REST.
   *
   * @return {Promise<AppCats, Error>} - Promise of categores Array
   */
  loadCategories (): Promise<AppCatsOrig> {
    return (
      fetch(
        "/categories",
        {
          method: "GET"
        }
      )
        .then(response => response.json())
    );
  }

  /**
   * Clean category title string
   *
   * @param {string} val - Category value to clean
   * @return {string} - Cleaned value
   */
  cleanCatTitle (val: string): string {
    return val.replace(CAT_CLEAN_RE, "").toLowerCase();
  }

  /**
   * Pre process categories
   *
   * @param {AppCats} cats - Catogories Array
   * @return {TrieSearch} -
   *   A TrieSearch object representing a Trie structure
   */
  preProcessCategories (cats: AppCatsOrig) {
    const buildCat: Function = (cat: AppCatOrig): AppCat  => {
      return {
        clean: this.cleanCatTitle(cat.title),
        title: cat.title,
        alias: cat.alias
      };
    };
    const ts: TrieSearch = (
      new TrieSearch(
        "clean",
        {
          min: 1,
          ignoreCase: false,
          splitOnRegEx: undefined
        }
      )
    );
    const builtCats: AppCats = cats.map(buildCat.bind(this));
    ts.addAll(builtCats);
    return ts;
  }

  /**
   * Returns loading element
   *
   * @return {ReactNode} - Element
   */
  renderLoading (): ReactNode {
    return (
      <div className="row pt-5">
        <div className="col text-center">
          <span className="fa fa-refresh fa-spin fa-3x fa-fw"></span>
        </div>
      </div>
    );
  }

  /**
   * Returns element for waiting for a search.
   *
   * @return {ReactNode} - Element
   */
  renderWaitingForAction (): ReactNode {
    return (
      <div className="row pt-5">
        <div className="col font-italic text-center">
          Search for businesses and activities in your area!
        </div>
      </div>
    );
  }

  /**
   * Wrapper to return Element for businesses
   * listings section.
   *
   * @return {ReactNode} - Element
   */
  renderBusinessSection (): ReactNode {
    //
    // A user operation is currently in progress
    //
    if (this.state.resultsStatus === "loading") {
      return this.renderLoading();
    }
    //
    // No business results are currently available
    // and no user operation is currently in progress
    //
    if (this.state.businessRecs == null) {
      return this.renderWaitingForAction();
    }
    //
    // We have received a response on request for
    // businesses, but no records exist
    //
    if (this.state.businessRecs.length === 0) {
      return this.renderResultsEmpty();
    }
    //
    // We have business records available to show
    //
    return this.renderBusinessesReady();
  }

  /**
   * Returns element for business ready to render results
   *
   * @return {ReactNode} - Element
   */
  renderBusinessesReady (): ReactNode {
    return (
      <div className="mt-3">
        {this.renderPagerBox()}
        {this.renderResultsTable()}
      </div>
    );
  }

  /**
   * Returns element for top pager information.
   *
   * @return {ReactNode} - Element
   */
  renderPagerBox (): ReactNode {
    return (
      <div className="row mb-1 justify-content-between">
        {this.renderPagerText()}
        {this.renderPagerNav()}
      </div>
    );
  }

  /**
   * Returns element for empty business results.
   *
   * @return {ReactNode} - Element
   */
  renderResultsEmpty (): ReactNode {
    const resultLabel: string = this.getFetchModeText();
    return (
      <div className="row pt-5">
        <div className="col font-italic text-center">
          No {resultLabel} are available.
        </div>
      </div>
    );
  }

  /**
   * Click handler for a top row head for specifying
   * sort field and sort direction.
   *
   * @param {string} code - Sort field
   * @param {ReactEvent} event - React click event
   * @return {boolean}
   */
  handleClickRowHeadField (
    code: string,
    event: ReactEvent
  ): boolean {
    event.preventDefault();
    const opts: Object = {
      sortField: this.state.sortField,
      sortDir: this.state.sortDir
    };
    if (this.state.sortField !== code) {
      opts.sortField = code;
    }
    else {
      opts.sortDir = (() => {
        if (this.state.sortDir === "asc") {
          return "desc";
        }
        if (this.state.sortDir === "desc") {
          return "asc";
        }
        this.setAppFatal("Invalid sort direction.");
        return "";
      })();
    }
    if (this.state.businessRecs == null) {
      this.setAppFatal("businessRecs must be set");
      return false;
    }
    opts.businessRecs = (
      this.sortBizRecs(
        this.state.businessRecs,
        opts.sortField,
        opts.sortDir
      )
    );
    this.setState(opts);
    return false;
  }

  /**
   * Returns an element for a field head to be clicked
   * for specifying sort field and direction.
   *
   * @param {string} val - Text to be displayed
   * @param {string} code - Sort field code
   * @return {ReactNode} - Element
   */
  renderRowHeadField (val: string, code: string): ReactNode {
    const iconClassName: string = (() => {
      if (this.state.sortDir === "asc") {
        return "fa-chevron-up";
      }
      if (this.state.sortDir === "desc") {
        return "fa-chevron-down";
      }
      this.setAppFatal("Invalid sort direction.");
      return "";
    })();
    const selected: boolean = (this.state.sortField === code);
    const linkClassName: string = (
      selected ?
        "sorter-select" :
        "sorter-noselect"
    );
    const sortIcon: ReactNode = (
      selected ?
        (
          <span>
            <span
                className={this.buildClassNames(["fa", iconClassName])}></span>
            &nbsp;
          </span>
        ) :
        null
    );
    return (
      <a
          className={linkClassName}
          href="#"
          onClick={this.handleClickRowHeadField.bind(this, code)}>
        {sortIcon}
        <span>
          {val}
        </span>
      </a>
    );
  }

  /**
   * Returnss business results table
   *
   * @return {ReactNode} - Element
   */
  renderResultsTable (): ReactNode {
    if (this.state.businessRecs == null) {
      this.setAppFatal("businessRecs should not be empty");
      return null;
    }
    const outRecs: Array<ReactNode> = (
      this.state.businessRecs.map(this.renderBusinessRec.bind(this))
    );
    return (
      <table>
        <thead>
          <tr className="text-uppercase font-weight-bold">
            <th>&nbsp;</th>
            <th>
              {this.renderRowHeadField("Name", "name")}
            </th>
            <th>
              {this.renderRowHeadField("Location", "location")}
            </th>
            <th className="text-center">
              {this.renderRowHeadField("Miles", "distance")}
            </th>
            <th className="text-center">
              {this.renderRowHeadField("Favorite", "favorite")}
            </th>
          </tr>
        </thead>
        <tbody>
          {outRecs}
        </tbody>
      </table>
    );
  }

  /**
   * Returns element for page nav actions
   *
   * @return {ReactNode} - Element
   */
  renderPagerNav (): ReactNode {
    if (this.state.fetchMode !== "search") {
      return null;
    }
    const [ showPrev: boolean, showNext: boolean ] = this.getPageLinkInfo();
    const optsPrev: Object = (
      showPrev ?
        {
          onClick: this.pageResults.bind(this, -1),
          href: "#"
        } :
        {}
    );
    const optsNext: Object = (
      showNext ?
        {
          onClick: this.pageResults.bind(this, +1),
          href: "#"
        } :
        {}
    );
    return (
      <div className="col text-right text-uppercase font-weight-bold">
        <a {...optsPrev}>Previous</a>
        &nbsp;&nbsp;<span className="pager-sep">|</span>&nbsp;&nbsp;
        <a {...optsNext}>Next</a>
      </div>
    );
  }

  /**
   * Gets fetch mode text for display
   *
   * @return {string}
   */
  getFetchModeText (): string {
    if (this.state.fetchMode === "search") {
      return "search results";
    }
    if (this.state.fetchMode === "favorite") {
      return "favorites";
    }
    this.setAppFatal("fetchMode must be set");
    return "";
  }

  /**
   * Returns Element displaying pager info
   *
   * @return {ReactNode} - Element
   */
  renderPagerText (): ReactNode {
    const resultLabel: string = this.getFetchModeText();
    if (this.state.offset == null) {
      this.setAppFatal("offset must be set");
      return null;
    }
    const start: number = this.state.offset;
    if (this.state.businessRecs == null) {
      this.setAppFatal("businessRecs must be set");
      return null;
    }
    const end: number = this.state.offset + this.state.businessRecs.length;
    return (
      <div className="col font-italic">
        Displaying{" "}
        <strong>{start}</strong>{" "}
        &mdash;{" "}
        <strong>{end}</strong>{" "}
        of{" "}
        <strong>{this.state.businessCountTotal}</strong>{" "}
        {resultLabel}
      </div>
    );
  }

  /**
   * Updates pager information
   *
   * @param {number} pageCount - Page count
   * @param {ReactEvent} event - React event
   * @return {boolean}
   */
  pageResults (pageCount: number, event: ReactEvent): boolean {
    event.preventDefault();
    const offset: number = this.getPageOffset(pageCount);
    this.fetchResultsForCurrentMode(offset);
    return false;
  }

  /**
   * Get page link info
   *
   * @return {Array<boolean>} - Show previous, Show Next
   */
  getPageLinkInfo (): [boolean, boolean] {
    if (this.state.offset == null) {
      this.setAppFatal("offset must be set");
      return [false, false];
    }
    const offset: number = this.state.offset;
    const bizTotal: ?number = this.state.businessCountTotal;
    const totalIsNull: boolean = (bizTotal === null);
    const showPrev: boolean = (!totalIsNull && (offset > 0));
    const showNext: boolean = (
      // $FlowFixMe
      (!totalIsNull && ((offset + BIZ_DISPLAY_LIMIT) <= bizTotal))
    );
    //debugger;
    return [showPrev, showNext];
  }

  /**
   * Get page offset
   *
   * @param {numbaer} pageCount - Page count
   * @return {number} - Offset value
   */
  getPageOffset (pageCount: number): number {
    if (this.state.offset == null) {
      this.setAppFatal("offset must be set");
      return 0;
    }
    const origOffset: number = this.state.offset;
    const incVal: number = BIZ_DISPLAY_LIMIT * pageCount;
    const checkOffset: number = origOffset + incVal;
    const offset: number = ((): number => {
      if (checkOffset <= 0) {
        return 0;
      }
      if (this.state.businessCountTotal == null) {
        return 0;
      }
      if (checkOffset > this.state.businessCountTotal) {
        return origOffset;
      }
      return checkOffset;
    })();
    return offset;
  }

  /**
   * Build class names string from array
   *
   * @param {Array<string|null>} classNames - Classnames array
   * @return {string} - Built classname string
   */
  buildClassNames (classNames: Array<?string>): string {
    return (
      classNames
        .filter((v) => (v !== null))
        .join(" ")
    );
  }

  /**
   * Checks if business has an associated favorite
   *
   * @param {string} bizId - Business id string from Yelp
   * @return {boolean}
   */
  doesBizHavFav (bizId: string): boolean {
    if (this.state.favorites == null) {
      this.setAppFatal("favorites must be set");
      return false;
    }
    const res: boolean = this.state.favorites.has(bizId);
    return res;
  }

  /**
   * Checks if business has a favorite, but
   * does not throw error if favorites have not
   * yet loaded, making it slightly different
   * from doesBizHavFav().
   *
   * @param {string} bizId - Business id string from Yelp
   * @return {boolean}
   */
  isFavorite (bizId: string): boolean {
    return (
      (this.state.favorites != null) &&
        (this.state.favorites.has(bizId))
    );
  }

  /**
   * Removes a favorite
   *
   * @param {string} bizId - Business id string from Yelp
   * @return {boolean}
   */
  removeFavorite (bizId: string): boolean {
    DB
      .favorites
      .where("business_id")
      .equals(bizId)
      .limit(1)
      .delete()
      .then(this.reloadFavorites.bind(this));
    return true;
  }

  /**
   * Refetches and syncs favorites
   *
   * @return {Promise<boolean>}
   */
  reloadFavorites (): Promise<boolean> {
    return (
      this
        .loadFavorites()
        .then(favorites => {
          this.setState({
            favorites: this.preProcessFavorites(favorites)
          });
          return true;
        })
    );
  }

  /**
   * Adds a favorite
   *
   * @param {string} bizId - Business id string from Yelp
   * @return {boolean}
   */
  addFavorite (bizId: string): boolean {
    DB
      .favorites
      .put({
        "business_id": bizId
      })
      .then(this.reloadFavorites.bind(this));
    return true;
  }

  /**
   * Handles when a favorite is clicked
   *
   * @param {string} bizId - Business id string from Yelp
   * @param {ReactEvent} event - React event
   * @return {boolean}
   */
  handleClickFav (
    bizId: string,
    // eslint-disable-next-line no-unused-vars
    event: ReactEvent
  ): boolean {
    const isFav: boolean = this.isFavorite(bizId);
    if (isFav) {
      this.removeFavorite(bizId);
      return true;
    }
    this.addFavorite(bizId);
    return true;
  }

  /**
   * Returns business record for display element
   *
   * @param {AppBizRec} biz - Business record
   * @return {ReactNode}
   */
  renderBusinessRec (biz: AppBizRec): ReactNode {
    const selected: boolean = this.doesBizHavFav(biz.id);
    const classes: Array<?string> = (
      selected ?
        ["fa", "fa-heart", "heart-select"] :
        ["fa", "fa-heart", "heart-noselect"]
    );
    const photoUrl: ?string = (
      (biz.photos.length > 0) ?
        biz.photos[0] :
        null
    );
    const photo: ReactNode = (
      (photoUrl !== null) ?
        (
          <img className="logo" src={photoUrl} />
        ) :
        null
    );
    const loc: Array<string> = [];
    if (biz.location.hasOwnProperty("city") && (biz.location.city !== null)) {
      loc.push(biz.location.city);
    }
    if (
      biz.location.hasOwnProperty("zip_code") &&
       (biz.location.zip_code !== null)
    ) {
      loc.push(biz.location.zip_code);
    }
    const locStr: string = (
      (loc.length > 0) ?
        loc.join(", ") :
        " "
    );
    const milesStr: string = (
      (biz.hasOwnProperty("distance") && (biz.distance != null)) ?
        this.convertMetersToMiles(biz.distance).toString() :
        " "
    );
    return (
      <tr key={biz.id}>
        <td>
          {photo}
        </td>
        <td>
          <a href={biz.url}>{biz.name}</a>
        </td>
        <td>{locStr}</td>
        <td className="text-center">{milesStr}</td>
        <td className="text-center">
          <span
              onClick={this.handleClickFav.bind(this, biz.id)}
              className={this.buildClassNames(classes)}>
          </span>
        </td>
      </tr>
    );
  }

  /**
   * Event handler when zip input is changed
   *
   * @param {ReactEvent} event - React event
   * @return {boolean}
   */
  handleChangeZip (event: ReactEvent): boolean {
    const val: ?string = (
      (event.target.value === "") ?
        null :
        event.target.value
    );
    const checkGood: RegExp = new RegExp("^[0-9]{1,5}(-[0-9]{0,4})?$");
    if (val != null) {
      if (!val.match(checkGood)) {
        return true;
      }
    }
    const checkFinal: RegExp = new RegExp("^[0-9]{5}(-[0-9]{4})?$");
    // Have to do this to make FlowType happy :(
    const zipFinal: ?string = ((): ?string => {
      if (val == null) {
        return null;
      }
      return (
        !val.match(checkFinal) ?
          null :
          val
      );
    })();
    this.setState({
      zip: val,
      zipFinal: zipFinal
    });
    return true;
  }

  /**
   * Renders zip input
   *
   * @return {ReactNode}
   */
  renderInputZipcode (): ReactNode {
    const zipVal: ?string = (
      (this.state.zip === null) ?
        "" :
        this.state.zip
    );
    return (
      <div className="form-group mr-2">
        <input
            className="form-control"
            onChange={this.handleChangeZip.bind(this)}
            placeholder="Zip Code"
            type="text"
            value={zipVal} />
      </div>
    );
  }

  /**
   * Converts meters to miles
   *
   * @param {number} meters - Meters
   * @return {number} - Miles
   */
  convertMetersToMiles (meters: number): number {
    if (meters >= DISTANCE_METERS_MAX) {
      return DISTANCE_MILES_MAX;
    }
    return (
      parseFloat((meters / DISTANCE_METERS_PER_MILE).toFixed(1))
    );
  }

  /**
   * Converts miles to meters
   *
   * @param {number} miles - Miles
   * @return {number} - Meters
   */
  convertMilesToMeters (miles: number): number {
    if (miles >= DISTANCE_MILES_MAX) {
      return DISTANCE_METERS_MAX;
    }
    return (miles * DISTANCE_METERS_PER_MILE);
  }

  /**
   * Event handler when distance is changedo
   *
   * @param {ReactEvent} event - React event
   * @return {boolean}
   */
  handleChangeDistance (event: ReactEvent): boolean {
    const miles: number = parseInt(event.target.value, 10);
    const meters: number = this.convertMilesToMeters(miles);
    this.setState({
      distanceMiles: miles,
      distanceMeters: meters
    });
    return true;
  }

  /**
   * Render distance input field
   *
   * @return {ReactNode}
   */
  renderInputDistance (): ReactNode {
    if (this.state.distanceMiles == null) {
      this.setAppFatal("distanceMiles must be set");
      return null;
    }
    const val: number = this.state.distanceMiles;
    const nums: Array<number> = this.range(1, DISTANCE_MILES_MAX + 1);
    return (
      <div className="form-group mr-2">
        <label className="mr-1" htmlFor="inp_distance">Miles:</label>
        <select
            id="inp_distance"
            className="form-control"
            value={val}
            onChange={this.handleChangeDistance.bind(this)}>
          {nums.map(num =>
            <option value={num} key={num}>{num.toString()}</option>
          )}
        </select>
      </div>
    );
  }

  /**
   * Returns a range of numbers
   *
   * @param {number} start - Start number
   * @param {number} end - End number
   * @return {Array<number>}
   */
  range (start: number, end: number): Array<number> {
    return Array.from({length: (end - start)}, (v, k) => k + start);
  }

  /**
   * Fetches search results, given an offset
   *
   * @param {number} offset - Offset index to start at
   * @return {boolean}
   */
  fetchSearchResults (offset: number): boolean {
    const varCat: ?string = (
      (this.state.selectedCat == null) ?
        null :
        this.state.selectedCat.alias
    );
    if (this.state.zip == null) {
      this.setAppFatal("zip must be set");
      return false;
    }
    if (this.state.distanceMeters == null) {
      this.setAppFatal("distanceMeters must be set");
      return false;
    }
    const queryObj: AppQueryObj = (
      this.buildQueryBizSearch(
        BIZ_SEARCH_LIMIT,
        offset,
        this.state.zip,
        this.state.distanceMeters,
        varCat
      )
    );
    GQL_CLIENT
      .send(queryObj.query, queryObj.variables)
      .then((data) => {
        this.setState({
          fetchMode: "search",
          resultsStatus: "ready",
          offset: offset,
          businessCountTotal: data.search.total,
          businessRecs: this.sortBizRecsFromState(data.search.business)
        });
      });
    return true;
  }

  /**
   * Wrapper to resort business recs
   *
   * @param {AppBizRecs} bizRecs - Business records
   * @return {AppBizRecs} - Sorted recs
   */
  sortBizRecsFromState (bizRecs: AppBizRecs): AppBizRecs {
    if (this.state.sortField == null) {
      this.setAppFatal("sortField must be set");
      return [];
    }
    if (this.state.sortDir == null) {
      this.setAppFatal("sortDir must be set");
      return [];
    }
    return this.sortBizRecs(bizRecs, this.state.sortField, this.state.sortDir);
  }

  /**
   * Sorts business recs
   *
   * @param {AppBizRecs} bizRecs - Business records
   * @param {string} sortField - Field code string to sort on
   * @param {sortDir} sortDir - Sort direction code
   * @return {AppBizRecs} - Sorted recs
   */
  sortBizRecs (
    bizRecs: AppBizRecs,
    sortField: string,
    sortDir: string
  ): AppBizRecs {
    const checkDir: Function = (condition): number => {
      const [dirYes: number, dirNo: number] = ((): [number, number] => {
        if (sortDir === "asc") {
          return [-1, +1];
        }
        if (sortDir === "desc") {
          return [+1, -1];
        }
        this.setAppFatal("Invalid sort direction");
        return [-1, -1];
      })();
      const ret: number = (condition ? dirYes : dirNo);
      return ret;
    };
    const sorter: Function = (recA: AppBizRec, recB: AppBizRec): number => {
      //
      // Sort Field: Distance
      //
      if (sortField === "distance") {
        const recACompDist: number = (
          (recA.distance == null) ?
            0 :
            recA.distance
        );
        const recBCompDist: number = (
          (recB.distance == null) ?
            0 :
            recB.distance
        );
        return checkDir(recACompDist < recBCompDist);
      }
      //
      // Sort Field: Name
      //
      if (sortField === "name") {
        return checkDir(recA.name < recB.name);
      }
      //
      // Sort Field: Location
      //
      if (sortField === "location") {
        const recACompLoc: [string, string] = [
          recA.location.city,
          recA.location.zip_code
        ];
        const recBCompLoc: [string, string] = [
          recB.location.city,
          recB.location.zip_code
        ];
        // $FlowFixMe
        return checkDir(recACompLoc < recBCompLoc);
      }
      //
      // Sort Field: Favorite
      //
      if (sortField === "favorite") {
        return checkDir(this.isFavorite(recA.id), this.isFavorite(recB.id));
      }
      //
      // Default
      //
      this.setAppFatal("Invalid sort field");
      return -1;
    };
    const outRecs: AppBizRecs = bizRecs.sort(sorter.bind(this));
    return outRecs;
  }

  /**
   * Event handler for form submission
   *
   * @param {ReactEvent} - React event
   * @return {boolean}
   */
  handleSubmitForm (event: ReactEvent): boolean {
    event.preventDefault();
    this.fetchResults("search", 0);
    return false;
  }

  /**
   * Builds a GraphQL fragment for a business response
   *
   * @return {string}
   */
  buildQueryStrBizFragment (): string {
    return (
      `
        fragment bizResponse on Business {
          id
          name
          url
          distance
          photos
          location {
            city
            zip_code
          }
          categories {
            title
            alias
          }
        }
      `
    );
  }

  /**
   * Build GraphQL query info for a business search
   *
   * @param {number} limit - Limit
   * @param {number} offset - Offset
   * @param {string} zipCode - Zip Code
   * @param {number} radius - Radius
   * @param {?string} category - Category
   * @return {AppQueryObj}
   */
  buildQueryBizSearch (
    limit: number,
    offset: number,
    zipCode: string,
    radius: number,
    category: ?string=null
  ): AppQueryObj {
    const query: string = (
      `
        ${this.buildQueryStrBizFragment()}

        query appQuery (
          $limit: Int!,
          $offset: Int!,
          $zip_code: String!,
          $radius: Float!,
          $categories: String
        ) {
          search(
            limit: $limit,
            offset: $offset,
            location: $zip_code,
            radius: $radius,
            categories: $categories
          ) {
            total
            business {
              ...bizResponse
            }
          }
        }
      `
    );
    const variables: Object = {
      limit: limit,
      offset: offset,
      zip_code: zipCode,
      radius: radius,
      categories: category
    };
    const res: AppQueryObj = {
      query: query,
      variables: variables
    };
    //console.log(query);
    //console.log(variables);
    return res;
  }

  /**
   * Build GraphQL query info for favorite businesses
   *
   * @param {Array<string>} bizIds - Businesses IDs from Yelp
   * @return {AppQueryObj}
   */
  buildQueryBizFavs (bizIds: Array<string>): AppQueryObj {
    const queryArgs: string = (
      bizIds
        .map((bizId: string, idx: number) => {
          return (
            `$id${idx}: String!`
          );
        })
        .join(", ")
    );
    const bizObjs: string = (
      bizIds
        .map((bizId: string, idx: number) => {
          return (
            `
              b${idx}:business(id: $id${idx}) {
                ...bizResponse
              }
            `
          );
        })
        .join("")
    );
    const query: string = (
      `
        ${this.buildQueryStrBizFragment()}

        query appQuery (${queryArgs}) {
          ${bizObjs}
        }
      `
    );
    const variables: Object = (
      this.arrayToObject (
        bizIds
          .map((bizId: string, idx: number) => {
            return [
              `id${idx}`,
              bizId
            ];
          })
      )
    );
    const res: AppQueryObj = {
      query: query,
      variables: variables
    };
    return res;
  }

  /**
   * Convert an array of tuples to object
   *
   * @param {Array<[any, any]>} pairs - Array of tuples
   * @return {Object}
   */
  arrayToObject (pairs: Array<[any, any]>): Object {
    // $FlowFixMe
    return Object.assign(...pairs.map((pair) => ({[pair[0]]: pair[1]})));
  }

  /**
   * Check if search form should be disabled
   *
   * @return {boolean}
   */
  isFormDisabled (): boolean {
    return (
      (this.state.zipFinal === null)
    );
  }

  /**
   * Export favorites as array
   *
   * @return {Array<string>}
   */
  exportFavorites (): Array<string> {
    if (this.state.favorites == null) {
      this.setAppFatal("favorites must be set");
      return [];
    }
    return Array.from(this.state.favorites.keys());
  }

  /**
   * Fetch and sync favorite results with state
   *
   * @return {boolean}
   */
  fetchFavResults (): boolean {
    if (this.state.favorites == null) {
      this.setAppFatal("favorites must be set");
      return false;
    }
    if (this.state.favorites.size === 0) {
      this.setState({
        fetchMode: "favorite",
        resultsStatus: "ready",
        selectedCat: null,
        typedCatVal: null,
        zip: null,
        zipFinal: null,
        distanceMiles: DISTANCE_DEFAULT,
        distanceMeters: this.convertMilesToMeters(DISTANCE_DEFAULT),
        offset: 0,
        businessCountTotal: 0,
        businessRecs: []
      });
      return true;
    }
    const queryObj: AppQueryObj = (
      this.buildQueryBizFavs(
        this.exportFavorites()
      )
    );
    if (this.state.favorites == null) {
      this.setAppFatal("favorites must be set");
      return false;
    }
    const favSize: number = this.state.favorites.size;
    GQL_CLIENT
      .send(queryObj.query, queryObj.variables)
      // Add this step to normalize the response data
      // so it is the same as our search response data
      .then(
        this.convertBizIdResponseRecs.bind(
          this,
          favSize
        )
      )
      .then((data) => {
        this.setState({
          fetchMode: "favorite",
          resultsStatus: "ready",
          selectedCat: null,
          typedCatVal: null,
          zip: null,
          zipFinal: null,
          distanceMiles: DISTANCE_DEFAULT,
          distanceMeters: this.convertMilesToMeters(DISTANCE_DEFAULT),
          offset: 0,
          businessCountTotal: data.search.total,
          businessRecs: data.search.business
        });
      });
    return true;
  }

  /**
   * Fetch results for current search mode
   *
   * @param {number} offset - Offset
   * @param {boolean}
   */
  fetchResultsForCurrentMode (offset: number): boolean {
    if (this.state.fetchMode == null) {
      this.setAppFatal("fetchMOde must be set");
      return false;
    }
    return this.fetchResults(this.state.fetchMode, offset);
  }

  /**
   * Fetch results
   *
   * @param {string} fetchMode - Fetch mode
   * @param {number} offset - Offset
   * @return {boolean}
   */
  fetchResults (fetchMode: string, offset: number): boolean {
    this.setState(
      {
        resultsStatus: "loading"
      },
      () => {
        if (fetchMode === "search") {
          this.fetchSearchResults(offset);
          return true;
        }
        if (fetchMode === "favorite") {
          this.fetchFavResults();
          return true;
        }
        this.setAppFatal("invalid fetchMode");
        return false;
      }
    );
    return false;
  }

  /**
   * General purpose error handler when all else fails
   *
   * @return {void}
   */
  setAppFatal (msg: string): void {
    throw new Error(msg);
  }

  /**
   * Handle click button to show favorites
   *
   * @param {ReactEvent} event - React event
   * @return {boolean}
   */
  handleClickShowFavorites (event: ReactEvent): boolean {
    event.preventDefault();
    this.fetchResults("favorite", 0);
    return false;
  }

  /**
   * Convert business id response records
   *
   * @param {number} totalCount - Total count of all records
   * @param {Object} resObj - Business response object
   * @return {Object}
   */
  convertBizIdResponseRecs (totalCount: number, resObj: Object): Object {
    // $FlowFixMe
    const recs: AppBizRecs = Object.values(resObj);
    const data: Object = {
      search: {
        total: totalCount,
        business: recs
      }
    };
    return data;
  }

  /**
   * Render favorites link
   *
   * @return {ReactNode}
   */
  renderLinkFavorites (): ReactNode {
    return (
      <div className="form-group ml-5">
        <button
            className="btn btn-success"
            onClick={this.handleClickShowFavorites.bind(this)}>
          Show All Favorites
        </button>
      </div>
    );
  }

  /**
   * Event handler which does nothing
   * Useful for disabling submits
   *
   * @param {ReactEvent} event - React event
   * @return {boolean}
   */
  handleNoop (event: ReactEvent): boolean {
    event.preventDefault();
    return false;
  }

  /**
   * Render form search bar
   *
   * @return {ReactNode}
   */
  renderInputs (): ReactNode {
    const isDisabled: boolean = this.isFormDisabled();
    const submitter: ?Function = (
      isDisabled ?
        this.handleNoop.bind(this) :
        this.handleSubmitForm.bind(this)
    );
    return (
      <form
          id="search_bar"
          className="form-inline justify-content-center pt-3 pb-3"
          onSubmit={submitter}>
        {this.renderInputDistance()}
        {this.renderInputZipcode()}
        {this.renderInputCategories()}
        {this.renderInputSubmit()}
        {this.renderLinkFavorites()}
      </form>
    );
  }

  /**
   * Render search submit button
   *
   * @return {ReactNode}
   */
  renderInputSubmit (): ReactNode {
    const isDisabled: boolean = this.isFormDisabled();
    return (
      <div className="form-group">
        <button
            className="btn btn-primary"
            type="submit"
            disabled={isDisabled}>
          Search
        </button>
      </div>
    );
  }

  /**
   * Render section containing business listing results
   *
   * @return {ReactNode}
   */
  renderResults (): ReactNode {
    return (
      <div>
        {this.renderBusinessSection()}
      </div>
    );
  }

  /**
   * Render for application ready state
   *
   * @return {ReactNode}
   */
  renderReady (): ReactNode {
    return (
      <main>
        {this.renderInputs()}
        {this.renderResults()}
      </main>
    );
  }

  /**
   * Render header section
   *
   * @return {ReactNode}
   */
  renderHeader (): ReactNode {
    return (
      <header className="pt-5 pb-5 text-center">
        <h1 className="text-uppercase mb-0">Yelp Business Search</h1>
        <h2 className="text-uppercase">
          By{" "}
          <a href="mailto:brendon@aphex.io">Brendon Crawford</a>
        </h2>
      </header>
    );
  }

  /**
   * Main render callback for React
   *
   * @return {ReactNode}
   */
  render (): ReactNode {
    return (
      <div className="container" data-component="app">
        {this.renderHeader()}
        {this.renderMain()}
      </div>
    );
  }

  /**
   * Check if app is ready
   *
   * @return {boolean}
   */
  checkAppIsReady (): boolean {
    return (
      (this.state.catTrie !== null) &&
        (this.state.favorites !== null)
    );
  }

  /**
   * Render main section below header
   *
   * @return {ReactNode}
   */
  renderMain (): ReactNode {
    if (!this.checkAppIsReady()) {
      return this.renderLoading();
    }
    return this.renderReady();
  }

}


export default App;

