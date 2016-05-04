<?php	

// http://files.figshare.com/1756790/002_t1_mpr_sag_standard.nii.gz

if(isset($_GET["action"]))
{
	switch($_GET["action"])
	{
		case "download":
			download($_GET);
			break;
	}
}

function download($params)
{
	$url=$params["url"];
	$hash=$params["hash"];
	
	// download file from origin url
	$tokens = explode('/', $url);
	$filename=$tokens[sizeof($tokens)-1];
	$handle=@fopen($url,'r');
	if($handle)
	{
		$dir=$_SERVER['DOCUMENT_ROOT']."/data/".$hash;
		
		if (!file_exists($dir)) {
			mkdir($dir,0777);
			chmod($dir,0777);
		}
		
		// get file info: dimensions and voxel size
		if (!file_exists($dir."/".$filename)) {
			@file_put_contents($dir."/info.txt",$url);		
			$result=@file_put_contents($dir."/".$filename,$handle);
			chmod($dir."/".$filename, 0777);
			if($result)
			{
				$tmp=@exec("../bin/volume -i ".$dir."/".$filename." -info|".
				'awk \'/dim:/{printf"{\"dim\":[%i,%i,%i],",$2,$3,$4}/voxelSize:/{printf"\"pixdim\":[%f,%f,%f]}",$2,$3,$4}\''
				,$arr,$retval);
				$info=json_decode($tmp);
				$info=json_decode($tmp);
				$info->url=$url;
				$info->localpath=$dir.'/'.$filename;
				$info->filename=$filename;
				$info->success=true;
				echo json_encode($info);
			}
			else
				echo '{"success":false,"message":"CANNOT DOWNLOAD FILE FROM SOURCE","result":"'.$result.'"}';
		}
		else {
			$tmp=@exec("../bin/volume -i ".$dir."/".$filename." -info|".
			'awk \'/dim:/{printf"{\"dim\":[%i,%i,%i],",$2,$3,$4}/voxelSize:/{printf"\"pixdim\":[%f,%f,%f]}",$2,$3,$4}\''
			,$arr,$retval);
			$info=json_decode($tmp);
			$info->url=$url;
			$info->localpath=$dir.'/'.$filename;
			$info->filename=$filename;
			$info->success=true;
			echo json_encode($info);
		}
	}
	else
		echo '{"success":false,"message":"CANNOT OPEN FILE AT SOURCE","result":"'.$handle.'"}';
}
?>