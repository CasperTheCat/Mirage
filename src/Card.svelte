<script lang='ts'>
	export let name = "Default Name";
    export let tag: String = undefined;
    export let imgPath = "";
    export let alt = "";
    export let fileSize = "";
    export let height = 128;

    import { createEventDispatcher } from 'svelte';

    const dispatch = createEventDispatcher();
    
    async function HandleCardClick(event)
    {
        let rect = event.target.getBoundingClientRect();

        let modx = rect.x + (rect.width/2);// + window.pageXOffset;
        let mody = rect.y + (rect.height/2);// + window.pageYOffset;

        if (window !== undefined && window.scrollY !== undefined && window.scrollX !== undefined)
        {
            modx = modx + window.scrollX;
            mody = mody + window.scrollY - (innerHeight / 2);
        }

        dispatch('summon', {
            "tag": tag,
            "x": modx,//.pageX,
            "y": mody//pageY
        });
    }

</script>

<div class="cardblank" on:click={HandleCardClick} style="height:{height}px">
    <div class="cardimage" style="height:{height - 32}px">
        {#if imgPath !== ""}
        <img src={imgPath}/ alt={alt}>
        {:else if fileSize > 0}
        <span class="cardspan" style="padding-top:{(height / 2) - 32}px">
            {#if fileSize < 1024}
                {fileSize} B
            {:else if fileSize < 1048576 }
                {Math.floor(fileSize/1024)} KiB
            {:else if fileSize < 1073741824 }
                {Math.floor(fileSize/1048576)} MiB
            {:else}
                {Math.floor(fileSize/1073741824)} GiB
            {/if}
        </span>
        {/if}
    </div>
    <div class="card">{name}</div>
</div>

<style>
    .cardspan {
        display: block;
        font-size: 2.5em;
        color: #ff3e00;
        font-family: 'Roboto','Bebas Neue', 'Flow Circular',  sans-serif;
    }

    .cardblank {
		width: 100%;
		height: 128px;
		background-color: #1c1c1c;
	}

	.cardimage {
		height: 96px;
        width: auto;
	}
</style>