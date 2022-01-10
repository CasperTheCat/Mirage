<script lang="ts">
	import { waitForDebugger } from 'inspector';
	import { tick } from 'svelte';
	import { onMount } from 'svelte';
	import { beforeUpdate, afterUpdate } from 'svelte';
	import Modal from './Modal.svelte';
	import Card from "./Card.svelte";
	import Image from "./Image.svelte";

	let showModal = false;
	let listedTags: string[] = [];
	let editTagString: string = "";
	let listedModalX: number = 0;
	let listedModalY: number = 0;
	let listedHash: string = "";

	export let name: string;
	let loggedIn: boolean = false;

	let countImages: number;
	countImages = 0;

	let photos = [];
	let loadedPhotoCount = 0;
	let SelectedBoardName = "";
	let SelectedBoardID = 0; // Invalid. ID starts at 1
	let TagSearchString: string = "Query";
	let bShouldDisplay: boolean = false;

	// Compute the width of the screen and adjust column count
	let columnarCount: number = 0;
	let columnImages = [];

	// Declare state enum
	const EState_FrontPage = 0;
	const EState_BoardSelect = 1;
	const EState_BoardView = 2;
	const EState_SearchView = 3;
	const EState_TagUntagView = 4;

	let PageState = EState_FrontPage;

	let KeyStateLive:boolean = false;

	async function HandleSubmitNewTags()
	{
		try
		{
			if (listedHash === "")
			{
				return;
			}

			let tgs = editTagString.split("\n");

			// for (let i = 0; i < tgs.length; ++i)
			// {
			// 	tgs[i] = `'${tgs[i]}'`
			// }

			let tgString: string = tgs.join(" ");

			console.log(tgString);

			let fetchable = await fetch(`/api/image/meta/${listedHash}/tag`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json;charset=utf-8'
				},
  				body: JSON.stringify(tgs)
			});
			
			showModal = false;
		}
		catch (Exception)
		{

		}
	}

	function ForcedScrollToModal()
	{
		scrollTo(0, listedModalY );// listedModalY);
	}

	async function HandleScroll(event)
	{
		if(showModal)
		{
			ForcedScrollToModal();
		}
	}

	async function HandleImageDesummon(event) 
	{
		listedTags = [];
		listedHash = "";
		listedModalX = 0;
		listedModalY = 0;
		showModal = false;
	}

	async function HandleImageSummon(event) 
	{
		try
		{
			//console.log(event.detail.hash);
			let fetchable = await fetch(`/api/image/meta/${event.detail.hash}/tag`);
			let blob: JSON = await fetchable.json();
			let tags: string[];

			if ("tags" in blob)
			{
				listedTags = blob["tags"];
				console.log(listedTags);
			}			

			listedModalX = event.detail.x;// - (innerHeight / 2) ;
			listedModalY = event.detail.y - (innerHeight / 2);

			editTagString = listedTags.join("\n");
			listedHash = event.detail.hash;

			showModal = true;
			ForcedScrollToModal();
		}
		catch (Exception)
		{
			console.log("Failed to summon image panel");
			showModal = false;
			console.log(Exception);
		}
	}

	async function HandleSearchInput(event)
	{
		if(KeyStateLive)
		{
			await ExecuteSearch();
		}
//		await tick();
	}

	async function HandleSearchKey(event)
	{
		// Handle Tab Key
		if (event.key === 'Tab')
		{
			event.preventDefault();
			KeyStateLive = !KeyStateLive;
		}

		if (event.key !== 'Enter') return;

		await ExecuteSearch();
	}

	async function ResetDisplayState()
	{
		TagSearchString = "";
		bShouldDisplay = false;
	}

	async function ResetSearchState()
	{
		TagSearchString = "";
	}

	async function SwitchToFrontPage()
	{
		try
		{
			// Reset Image Count
			loadedPhotoCount = 0;
			PageState = EState_FrontPage;
		}
		catch (Exception)
		{
			PageState = EState_FrontPage;
		}
		finally
		{
			ResetDisplayState();
		}
		
	}

	async function SwitchToBoardSelect()
	{
		try
		{
			// Load Boards
			await LoadBoards();
			PageState = EState_BoardSelect;
		}
		catch (Exception)
		{
			PageState = EState_FrontPage;
		}
		finally
		{
			ResetSearchState();
		}
	}

	async function ExecuteSearch() 
	{
		if (TagSearchString === "")
		{
			bShouldDisplay = false;
			return;
		}

		try
		{
			if (PageState === EState_SearchView)
			{
				await LoadImages(`/api/search/bytag/${TagSearchString}`);
			}
			else
			{
				console.log("State is bad?");
				return;
			}
		}
		catch (Exception)
		{
			//throw Exception;
			console.log("Bad Search");
		}
		finally
		{
			bShouldDisplay = true;
		}
	}

	async function SwitchToSearchView()
	{
		try
		{
			// Don't load. We wait for search
			//await LoadImages('/api/search/image');
			PageState = EState_SearchView;
		}
		catch (Exception)
		{
			//console.log(Exception);
			PageState = EState_FrontPage;
		}
		finally
		{
			ResetSearchState();
		}
		
	}	

	async function SwitchToBoardView(id: number)
	{
		try
		{
			await LoadImages(`/api/board/${id}/images`);
			SelectedBoardID = id;
			PageState = EState_BoardView;
		}
		catch (Exception)
		{
			PageState = EState_FrontPage;
		}
		finally
		{
			ResetSearchState();
		}
		
	}

	async function SwitchToTaggerSelect()
	{
		try
		{
			await LoadImages("/api/search/image")
			bShouldDisplay = true;
			console.log(photos);
			PageState = EState_TagUntagView;
		}
		catch (Exception)
		{
			PageState = EState_FrontPage;
		}
		finally
		{
			//ResetState();
			ResetSearchState();
		}
		
	}

	async function fetchStats()
	{
		try
		{
			let fetched = await fetch(`/stats`);
			let statistics: JSON = await fetched.json();

			if ("count" in statistics)
			{
				countImages = parseInt(statistics["count"], 10);
			}
		}
		catch (Exception)
		{
			if (loggedIn)
			{
				// Okay... Something has *actually* gone wrong
				console.log("Fetching Mirage Stats failed");
			}
		}
	}

	async function GetUserInfo()
	{
		try
		{
			let fetched = await fetch(`/api/user`);
			let userinfo: JSON = await fetched.json();

			name = userinfo['displayname'];
			loggedIn = true;
		}
		catch (Exception)
		{
			if (loggedIn)
			{
				// Okay... Something has *actually* gone wrong
				console.log("Fetching Mirage user has failed, but state says session is live");
			}
		}
		finally
		{
			
		}
	}
	
	onMount(fetchStats);
	onMount(GetUserInfo);

	function argmin(a) {
		let lowest = 0;
		for (let i = 1; i < a.length; i++) {
			if (a[i] < a[lowest]) lowest = i;
		}
		return lowest;
	}

	async function updateColumns(updateIsQuery: boolean = false)
	{
		// We want to enforce a minimum of 250px and a max of 500 for this view.
		let proxy = Math.max(1, (innerWidth / 375));// + 1;
		//console.log(proxy)

		let newColumnCount = Math.floor(proxy);
		if (newColumnCount !== columnarCount || updateIsQuery)
		{
			// Update the lists
			columnImages = [];
			let heights = [];
			for (let i = 0; i < newColumnCount; ++i)
			{
				columnImages.push([]);
				heights.push(i * 0.001)
			}		

			for (let i = 0; i < photos.length; ++i)
			{
				//i % newColumnCount
				let operatingIndex = argmin(heights);
				//console.log("W", operatingIndex);
				//console.log(heights);
				columnImages[operatingIndex].push(photos[i]);
				const photo = photos[i];
				heights[operatingIndex] += photo["height"] / photo["width"];	
			}

			columnarCount = newColumnCount;
		}
	}

	async function boundUpdateColumns()
	{
		await updateColumns();
	}

	async function LoadBoards(override: boolean = false)
	{
		// Go ahead and check we're even in the correct state
		// if (!(PageState === EState_BoardView || override))
		// {
		// 	return;
		// }

		try
		{
			let fetchable = await fetch('/api/board')
			let blob: JSON = await fetchable.json();
			
			console.log(blob);
		}
		catch (Exception)
		{
			throw Exception;
		}
		finally
		{

		}
	}

	async function LoadImages(path:string, override: boolean = false)
	{
		// Go ahead and check we're even in the correct state
		// if (
		// 	!(
		// 		PageState === EState_SearchView ||
		// 		PageState === EState_BoardView ||
		// 		override
		// 	)
		// )
		// {
		// 	return;
		// }

		try
		{
			let fetchable = await fetch(path);
			let blob: JSON = await fetchable.json();

			if ("images" in blob)
			{
				photos = blob["images"];
				loadedPhotoCount = photos.length;
				console.log(photos);
			}

			photos.sort((a,b) => {
				let r1 = a["height"] / a["width"];
				let r2 = b["height"] / b["width"];
				return r2 - r1;
			});

			// if (photos.length > 20)
			// {
			// 	photos = photos.slice(0, 20);
			// }

			// Update
			await updateColumns(true);
		}
		catch (Exception)
		{
			throw Exception;
		}
	}

	// // Also, fetch temporary images
	// onMount(async () => {
	// 	try 
	// 	{
	// 		await LoadBoards();
	// 	}
		
	// });

	//beforeUpdate(updateColumns);
	//onMount(updateColumns);

</script>

<svelte:window on:hashchange={GetUserInfo} on:resize={boundUpdateColumns} on:scroll={HandleScroll}/>

<nav>
	<div class="title" on:click={SwitchToFrontPage}>
		<h1>
			Mirage{name !== "" ? "/" : ""}{name}{#if PageState === EState_BoardSelect}
			/Boards
			{:else if PageState === EState_BoardView}
			/{SelectedBoardName}
			{:else if PageState === EState_SearchView}
			/Search
			{:else if PageState === EState_TagUntagView}
			/Untagged
			{/if}
			
		</h1>
		<span style="margin-left:10px;"><em>{loadedPhotoCount}/{countImages}</em></span>
	</div>
	<div class="box">
		<a href="/{loggedIn ? "logout":"login"}"> {loggedIn ? "Sign Out":"Sign In"} </a>
	</div>
</nav>

<main style={PageState === EState_BoardSelect || PageState === EState_FrontPage ? "padding-top: 64px;" : "padding-top: 54px;"}>
	<!-- <p>Welcome to the Mirage Moodboard</p>
	<br/>
	{#if countImages > 0}
		<p>Mirage contains {countImages} {countImages === 1 ? 'image' : 'images'}</p>
		<br/>
	{/if} -->
	{#if loggedIn}
		{#if PageState === EState_SearchView}
			<div>Tag Search</div>
			<input bind:value={TagSearchString} placeholder="Query" on:input={HandleSearchInput} on:keydown={HandleSearchKey}>
			<input type="submit" value="Execute" on:click={ExecuteSearch}/>
			<!-- <input  value="Submit"> -->
		{/if}

		{#if (
			PageState === EState_SearchView || 
			PageState === EState_BoardView || 
			PageState === EState_TagUntagView 
			)}
			<!-- && loadedPhotoCount > 0} -->
			{#if (bShouldDisplay && loadedPhotoCount > 0)}
				<div class="photos" style="grid-template-columns: repeat({columnarCount}, 1fr);">
					{#each columnImages as col}
						<div class="flexi">
							{#each col as photo}
								<!-- <img src="/api/image/data/{photo.hash}" alt="" on:click={HandleImageSummon}> -->
								<Image hash="{photo.hash}" on:summon={HandleImageSummon}/>
							{/each}
						</div>
					{/each}
				</div>
			{:else if bShouldDisplay}
				<p>Nothing to display!</p>
			{/if}
		{:else if PageState === EState_BoardSelect}
			<div></div>
		{:else}
			<div class="menu">
				<Card on:click={SwitchToBoardSelect} name="Boards"/>
				<Card on:click={SwitchToSearchView} name="Search"/>
				<Card on:click={SwitchToTaggerSelect} name="Untagged"/>
			</div>
		{/if}
	{/if}
</main>

{#if showModal}
<Modal offsetY={listedModalY} on:close={HandleImageDesummon}>
	<h2 slot="header">
		Item Tagging
	</h2>
	<textarea bind:value={editTagString}></textarea>
	<button on:click={HandleSubmitNewTags}>Save Tags</button>
</Modal>
{/if}

<style>
	.menu {
		justify-content: center;
		display:grid;
		row-gap: 10px;
		column-gap: 10px;
		grid-template-columns: repeat(auto-fit, min(100%, 375px));
	}

	h1
	{
		font-size: 1.35em;
		color: #ff3e00;
		font-weight: 100;
		font-family: 'Roboto','Bebas Neue', 'Flow Circular',  sans-serif;
		font-display: swap;
		
		margin-left: 25px;
	}

	nav 
	{
		position: fixed;
		width: 100%;
		height: 54px;
		line-height: 54px;
		background-color: #1c1c1c;
	}

	nav div.box
	{
		float:right;
	}

	nav a
	{
		line-height: 54px;
		margin-right:25px;
	}

	nav div.title
	{
		float:left;
		display: flex;
		flex-direction: row;
	}

	nav div span{
		line-height: 56px;
	}

	.photos {
		width: 100%;
		display: grid;
		grid-gap: 0px;
		grid-row-gap: 0px;
	}

	.flexi {
		display: flex;
		flex-direction: column;
	}

	img {
		width: 100%;
		margin: 0;
		border: none;
	}

    textarea
    {
        background-color: #3c3c3c;
        color: white;
		width:100%;
    }

	button
	{
		background-color: #2c2c2c;
        color: white;
	}


	@media (min-width: 640px) {
		main {
			max-width: none;
		}
	}
</style>