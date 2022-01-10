<script>
	export let name = "Default Name";
    export let imgPath = "";
    export let alt = "";
</script>

<div class="cardblank" on:click>
    <div class="cardimage">
        {#if imgPath !== ""}
        <img src={imgPath}/ alt={alt}>
        {/if}
    </div>
    <div class="card">{name}</div>
</div>

<style>
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